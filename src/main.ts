import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { writeLog } from './utils/logger';
import { blogConfigs } from './crawl_config';
import * as admin from 'firebase-admin';
import { Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { BlogConfig } from './types';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { formatCrawlingResult, sendSlackMessage } from './webHook/slack';
import { analyzeContent, ContentAnalysisResult } from './utils/gemini';

// 로그 설정
process.env.DEBUG = '*';
process.env.NODE_ENV = process.argv.includes('--dev') ? 'development' : 'production';

// Firebase 관련 변수
let db: Firestore;

// Firebase 초기화 함수
function initializeFirebase(): boolean {
    try {
        if (!admin.apps.length) {
            // 환경에 따른 서비스 계정 키 파일 선택
            const isDevMode = process.argv.includes('--dev') || process.env.FIREBASE_ENV === 'dev';
            const serviceAccountPath = isDevMode ? '../serviceAccountKey.dev.json' : '../serviceAccountKey.prod.json';

            try {
                const serviceAccount = require(serviceAccountPath);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                db = admin.firestore();
                writeLog(`Firebase 초기화 성공 (${isDevMode ? 'Development' : 'Production'} 환경)`);
                return true;
            } catch (error) {
                writeLog(`서비스 계정 키 파일 로드 실패 (${serviceAccountPath}): ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        }
        return true;
    } catch (error) {
        writeLog(`Firebase 초기화 실패: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

// RSS 파서 설정
const parser: Parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/atom+xml,application/xml,text/xml,application/rss+xml'
    },
    customFields: {
        item: [
            ['content:encoded', 'contentEncoded'],
            ['description', 'description'],
            ['summary', 'summary'],
            ['subtitle', 'subtitle'],
            ['content', 'content'],
            ['dc:creator', 'creator']
        ]
    }
});

// HTML 태그 제거 함수
function stripHtml(html: string | undefined): string {
    if (!html) return '';
    const $ = cheerio.load(html);
    $('script').remove();
    $('style').remove();
    return $.text().trim();
}

// URL을 document ID로 변환하는 함수
function normalizeUrlToDocId(url: string): string {
    return url.replace(/^https?:\/\//, '')    // http:// 또는 https:// 제거
        .replace(/[.#$\[\]\/]/g, '_')    // Firestore에서 사용할 수 없는 문자 변환
        .replace(/[?&=]/g, '_')          // URL 파라미터 관련 문자 변환
        .replace(/%[0-9A-F]{2}/g, '_')   // URL 인코딩된 문자 변환
        .replace(/_{2,}/g, '_');         // 연속된 언더스코어를 하나로 통합
}

// 크롤링 함수
export async function crawlBlog(blogConfig: BlogConfig, isTestMode = false): Promise<{
    blogName: string;
    total: number;
    skipped: number;
    success: boolean;
    error?: string;
    failedPosts?: Array<{
        title?: string;
        url?: string;
        reason: string;
    }>;
}> {
    try {
        writeLog(`[${blogConfig.name}] 크롤링 시작`);

        // Firebase 초기화 (테스트 모드가 아닐 때만)
        if (!isTestMode) {
            const isInitialized = initializeFirebase();
            if (!isInitialized) {
                writeLog(`[${blogConfig.name}] Firebase 초기화 실패로 크롤링 중단`);
                return {
                    blogName: blogConfig.name,
                    total: 0,
                    skipped: 0,
                    success: false,
                    error: 'Firebase 초기화 실패'
                };
            }
        }

        // RSS 피드 파싱
        const feed = await parser.parseURL(blogConfig.feedUrl);
        writeLog(`[${blogConfig.name}] ${feed.items.length}개의 글 발견`);

        let batch = isTestMode ? null : db.batch();
        let batchCount = 0;
        let totalProcessed = 0;
        let totalNew = 0;
        let totalSkipped = 0;
        const failedPosts: Array<{ title?: string; url?: string; reason: string }> = [];

        // 각 글 처리
        for (const item of feed.items) {
            try {
                // 기본 데이터 준비
                const $ = cheerio.load(item.content || '');

                if (!item.link) {
                    failedPosts.push({
                        title: item.title,
                        reason: 'URL이 없음'
                    });
                    writeLog(`[${blogConfig.name}] 링크가 없는 글 발견: ${item.title}`);
                    continue;
                }

                // URL을 document ID로 변환
                const docId = normalizeUrlToDocId(item.link);

                // document 존재 여부 확인 (테스트 모드가 아닐 때만)
                if (!isTestMode) {
                    const docRef = db.collection('Blogs').doc(docId);
                    const doc = await docRef.get();

                    if (doc.exists) {
                        totalSkipped++;
                        writeLog(`[${blogConfig.name}] 이미 저장된 글 스킵: ${item.title} (${totalSkipped}/${feed.items.length})`);
                        continue;
                    }
                }

                // 컨텐츠 추출
                const contentResult = await blogConfig.extractContent($, item.link, item);
                const textContent = stripHtml(contentResult.content);

                // 기본 AI 분석 결과 (유효하지 않은 경우)
                let analysisResult: ContentAnalysisResult = {
                    isValid: false,
                    skillIds: [],
                    jobGroupIds: []
                };

                // 컨텐츠 유효성 검사
                if (!textContent.trim()) {
                    failedPosts.push({
                        title: item.title,
                        url: item.link,
                        reason: '본문이 비어있음'
                    });
                    writeLog(`[${blogConfig.name}] 본문이 비어있는 글 발견: ${item.title}`);
                } else if (!item.title) {
                    failedPosts.push({
                        url: item.link,
                        reason: '제목이 비어있음'
                    });
                    writeLog(`[${blogConfig.name}] 제목이 비어있는 글 발견: ${item.link}`);
                } else {
                    // title과 content가 모두 있는 경우에만 Gemini AI 분석 실행
                    analysisResult = await analyzeContent(item.title, textContent);

                    // 상세 로깅
                    writeLog(`[${blogConfig.name}] AI 분석 결과 - ${item.title}`);
                    writeLog(`  - 기술 콘텐츠 여부: ${analysisResult.isValid ? 'O' : 'X'}`);
                    if (analysisResult.skillIds.length > 0) {
                        writeLog(`  - 추출된 기술 스킬 (${analysisResult.skillIds.length}개): ${analysisResult.skillIds.join(', ')}`);
                    } else {
                        writeLog(`  - 추출된 기술 스킬: 없음`);
                    }
                    if (analysisResult.jobGroupIds.length > 0) {
                        writeLog(`  - 추출된 직군 (${analysisResult.jobGroupIds.length}개): ${analysisResult.jobGroupIds.join(', ')}`);
                    } else {
                        writeLog(`  - 추출된 직군: 없음`);
                    }
                }

                // 썸네일 추출
                const thumbnailUrl = await blogConfig.extractThumbnail($, item.link, item);

                // 작성자 정보
                const author = item.creator || (blogConfig.authorSelector ? $(blogConfig.authorSelector).first().text().trim().split(',')[0] : blogConfig.name);

                // 로그 출력
                writeLog(`[${blogConfig.name}] ${item.title} - 본문 길이: ${textContent.length}자 / ` +
                    `description 추출: ${contentResult.description ? 'O' : 'X'} / ` +
                    `썸네일 추출: ${thumbnailUrl ? 'O' : 'X'} / ` +
                    `작성자: ${author}`);

                if (!isTestMode && batch) {
                    // document ID로 문서 참조 생성
                    const docRef = db.collection('Blogs').doc(docId);
                    const contentRef = docRef.collection('Content').doc('content');

                    // 메인 문서 데이터 (AI 분석 결과 포함)
                    batch.set(docRef, {
                        id: docId,
                        title: item.title,
                        linkUrl: item.link,
                        publishDate: Timestamp.fromDate(new Date(item.pubDate || item.isoDate || new Date())),
                        author: author,
                        blogId: blogConfig.id,
                        blogName: blogConfig.name,
                        description: contentResult.description || '',
                        thumbnailUrl: thumbnailUrl,
                        isValid: analysisResult.isValid,
                        skillIds: analysisResult.skillIds,
                        jobGroupIds: analysisResult.jobGroupIds,
                        random: Array.from({ length: 5 }, (_, i) => ({
                            [i + 1]: Math.random()
                        })).reduce((acc, curr) => ({ ...acc, ...curr }), {}),
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp()
                    });

                    // 컨텐츠 서브컬렉션 데이터
                    batch.set(contentRef, {
                        text: textContent
                    });

                    batchCount += 2;  // 메인 문서와 컨텐츠 문서, 2개씩 증가
                    totalNew++;

                    // Firestore 배치 작업 제한(500)에 도달하면 커밋
                    if (batchCount >= 498) {  // 500에 약간 못 미치게 설정
                        await batch.commit();
                        batch = db.batch();
                        batchCount = 0;
                        writeLog(`[${blogConfig.name}] 배치 커밋 완료`);
                    }
                }

                totalProcessed++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                failedPosts.push({
                    title: item.title,
                    url: item.link,
                    reason: errorMessage
                });
                writeLog(`[${blogConfig.name}] 글 처리 중 오류 발생: ${errorMessage}`);
                continue;
            }
        }

        // 남은 배치 작업 처리
        if (!isTestMode && batch && batchCount > 0) {
            await batch.commit();
            writeLog(`[${blogConfig.name}] 최종 배치 커밋 완료`);
        }

        writeLog(`[${blogConfig.name}] 크롤링 완료. 총 ${totalProcessed}개의 글 중 ${totalNew}개의 새 글 처리됨 (${totalSkipped}개 스킵)`);
        return {
            blogName: blogConfig.name,
            total: totalNew,
            skipped: totalSkipped,
            success: true,
            failedPosts: failedPosts.length > 0 ? failedPosts : undefined
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writeLog(`[${blogConfig.name}] 크롤링 중 오류 발생: ${errorMessage}`);
        return {
            blogName: blogConfig.name,
            total: 0,
            skipped: 0,
            success: false,
            error: errorMessage
        };
    }
}

// 메인 함수
export async function main(): Promise<void> {
    const isTestMode = process.argv.includes('--test');
    const targetBlogId = process.argv.find((arg) => arg.startsWith('--blog='))?.split('=')[1];

    writeLog('크롤링 시작');
    writeLog(`실행 모드: ${isTestMode ? '테스트' : '프로덕션'}`);
    writeLog(`대상 블로그: ${targetBlogId || '전체'}`);

    if (isTestMode) {
        writeLog('테스트 모드로 실행 중 (Firebase 저장 및 슬랙 알림 건너뜀)');
    }

    const results = [];

    if (targetBlogId) {
        // 특정 블로그만 크롤링
        const blogConfig = blogConfigs[targetBlogId];
        if (!blogConfig) {
            writeLog(`Error: 블로그 ID "${targetBlogId}"를 찾을 수 없습니다.`);
            writeLog('사용 가능한 블로그 ID: ' + Object.keys(blogConfigs).join(', '));
            return;
        }
        const result = await crawlBlog(blogConfig, isTestMode);
        results.push(result);
    } else {
        // 모든 블로그 크롤링
        for (const blogConfig of Object.values(blogConfigs)) {
            const result = await crawlBlog(blogConfig, isTestMode);
            results.push(result);
        }
    }

    // 결과 처리
    if (!isTestMode) {
        const message = formatCrawlingResult(results);
        await sendSlackMessage(message);
    }

    writeLog('크롤링 완료');
}

// 오전 9시 크롤링 (프로덕션)
export const morningCrawlingProd = onSchedule(
    {
        schedule: '0 9 * * *',  // 매일 오전 9시
        timeZone: 'Asia/Seoul',
        region: 'asia-northeast3',
        minInstances: 0,
        timeoutSeconds: 540
    },
    async (_context) => {
        try {
            process.env.FIREBASE_ENV = 'prod';
            writeLog('오전 크롤링 작업 시작 (Production)');
            await main();
            writeLog('오전 크롤링 작업 완료 (Production)');
        } catch (error) {
            writeLog(`오전 크롤링 작업 중 오류 발생 (Production): ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
);

// 오후 10시 30분 크롤링 (프로덕션)
export const eveningCrawlingProd = onSchedule(
    {
        schedule: '30 22 * * *',  // 매일 오후 10시 30분
        timeZone: 'Asia/Seoul',
        region: 'asia-northeast3',
        minInstances: 0,
        timeoutSeconds: 540
    },
    async (_context) => {
        try {
            process.env.FIREBASE_ENV = 'prod';
            writeLog('오후 크롤링 작업 시작 (Production)');
            await main();
            writeLog('오후 크롤링 작업 완료 (Production)');
        } catch (error) {
            writeLog(`오후 크롤링 작업 중 오류 발생 (Production): ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
);

// 오전 9시 크롤링 (개발)
export const morningCrawlingDev = onSchedule(
    {
        schedule: '0 9 * * *',  // 매일 오전 9시
        timeZone: 'Asia/Seoul',
        region: 'asia-northeast3',
        minInstances: 0,
        timeoutSeconds: 540
    },
    async (_context) => {
        try {
            process.env.FIREBASE_ENV = 'dev';
            writeLog('오전 크롤링 작업 시작 (Development)');
            await main();
            writeLog('오전 크롤링 작업 완료 (Development)');
        } catch (error) {
            writeLog(`오전 크롤링 작업 중 오류 발생 (Development): ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
);

// 오후 10시 30분 크롤링 (개발)
export const eveningCrawlingDev = onSchedule(
    {
        schedule: '30 22 * * *',  // 매일 오후 10시 30분
        timeZone: 'Asia/Seoul',
        region: 'asia-northeast3',
        minInstances: 0,
        timeoutSeconds: 540
    },
    async (_context) => {
        try {
            process.env.FIREBASE_ENV = 'dev';
            writeLog('오후 크롤링 작업 시작 (Development)');
            await main();
            writeLog('오후 크롤링 작업 완료 (Development)');
        } catch (error) {
            writeLog(`오후 크롤링 작업 중 오류 발생 (Development): ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
);

// HTTP 엔드포인트 - 크롤링 테스트용
export const testCrawling = onRequest(
    {
        region: 'asia-northeast3',
        minInstances: 0,
        timeoutSeconds: 540
    },
    async (req, res) => {
        try {
            // 쿼리 파라미터로 환경 설정
            const env = req.query.env as string;
            if (env === 'dev') {
                process.env.FIREBASE_ENV = 'dev';
            } else {
                process.env.FIREBASE_ENV = 'prod';
            }

            writeLog(`테스트 크롤링 시작 (${env === 'dev' ? 'Development' : 'Production'})`);
            await main();
            writeLog(`테스트 크롤링 완료 (${env === 'dev' ? 'Development' : 'Production'})`);
            res.status(200).send('크롤링이 완료되었습니다.');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            writeLog(`테스트 크롤링 중 오류 발생: ${errorMessage}`);
            await sendSlackMessage(`❌ 크롤링 실패\n🚨 에러: ${errorMessage}`);
            res.status(500).send('크롤링 중 오류가 발생했습니다.');
        }
    }
);