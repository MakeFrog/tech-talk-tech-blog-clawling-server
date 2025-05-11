import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { writeLog } from './utils/logger';
import { blogConfigs } from './crawl_config';
import * as admin from 'firebase-admin';
import { Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { BlogConfig } from './crawl_config/types';

// Firebase 관련 변수
let db: Firestore;

// Firebase 초기화 함수
function initializeFirebase(): boolean {
    try {
        if (!admin.apps.length) {
            const serviceAccount = require('../serviceAccountKey.json');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            db = admin.firestore();
            writeLog('Firebase 초기화 성공');
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
            ['content', 'content']
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

// 크롤링 함수
async function crawlBlog(blogConfig: BlogConfig, isTestMode = false): Promise<void> {
    try {
        writeLog(`[${blogConfig.name}] 크롤링 시작`);

        // RSS 피드 파싱
        const feed = await parser.parseURL(blogConfig.feedUrl);
        writeLog(`[${blogConfig.name}] ${feed.items.length}개의 글 발견`);

        let batch = isTestMode ? null : db.batch();
        let batchCount = 0;
        let totalProcessed = 0;

        // Firebase 초기화 (테스트 모드가 아닐 때만)
        if (!isTestMode) {
            const isInitialized = initializeFirebase();
            if (!isInitialized) {
                writeLog(`[${blogConfig.name}] Firebase 초기화 실패로 크롤링 중단`);
                return;
            }
        }

        // 각 글 처리
        for (const item of feed.items) {
            try {
                // 기본 데이터 준비
                const $ = cheerio.load(item.content || '');

                if (!item.link) {
                    writeLog(`[${blogConfig.name}] 링크가 없는 글 발견: ${item.title}`);
                    continue;
                }

                // 컨텐츠 추출
                const contentResult = await blogConfig.extractContent($, item.link, item);
                const textContent = stripHtml(contentResult.content);

                // 썸네일 추출
                const thumbnailUrl = await blogConfig.extractThumbnail($, item.link, item);

                // 로그 출력
                writeLog(`[${blogConfig.name}] ${item.title} - 본문 길이: ${textContent.length}자 / ` +
                    `description 추출: ${contentResult.description ? 'O' : 'X'} / ` +
                    `썸네일 추출: ${thumbnailUrl ? 'O' : 'X'}`);

                if (!isTestMode && batch) {
                    // 문서 참조 생성
                    const docRef = db.collection('Blogs').doc();
                    const contentRef = docRef.collection('Content').doc('content');

                    // 메인 문서 데이터
                    batch.set(docRef, {
                        id: docRef.id,
                        title: item.title,
                        linkUrl: item.link,
                        publishDate: Timestamp.fromDate(new Date(item.pubDate || item.isoDate || new Date())),
                        author: blogConfig.authorSelector ? $(blogConfig.authorSelector).text().trim() : blogConfig.name,
                        blogId: blogConfig.id,
                        blogName: blogConfig.name,
                        description: contentResult.description || '내용 없음',
                        thumbnailUrl: thumbnailUrl,
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp()
                    });

                    // 컨텐츠 서브컬렉션 데이터
                    batch.set(contentRef, {
                        text: textContent
                    });

                    batchCount += 2;  // 메인 문서와 컨텐츠 문서, 2개씩 증가

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
                writeLog(`[${blogConfig.name}] 글 처리 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
        }

        // 남은 배치 작업 처리
        if (!isTestMode && batch && batchCount > 0) {
            await batch.commit();
            writeLog(`[${blogConfig.name}] 최종 배치 커밋 완료`);
        }

        writeLog(`[${blogConfig.name}] 크롤링 완료. 총 ${totalProcessed}개의 글 처리됨`);
    } catch (error) {
        writeLog(`[${blogConfig.name}] 크롤링 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// 메인 함수
async function main(): Promise<void> {
    const isTestMode = process.argv.includes('--test');
    if (isTestMode) {
        writeLog('테스트 모드로 실행 중 (Firebase 저장 건너뜀)');
    } else {
        const isInitialized = initializeFirebase();
        if (!isInitialized) {
            writeLog('Firebase 초기화 실패로 프로그램을 종료합니다.');
            return;
        }
    }

    for (const [blogId, config] of Object.entries(blogConfigs)) {
        await crawlBlog(config, isTestMode);
    }
}

// 명령어 처리
const command = process.argv[2];
switch (command) {
    case '--delete':
        if (initializeFirebase()) {
            // TODO: Implement deleteAllDocuments function
            writeLog('삭제 기능은 아직 구현되지 않았습니다.');
        } else {
            writeLog('Firebase 초기화 실패로 삭제를 진행할 수 없습니다.');
        }
        break;
    case '--test':
        writeLog('테스트 모드로 실행됨');
        main().catch(error => {
            writeLog(`프로그램 실행 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        });
        break;
    case '--crawl':
        main().catch(error => {
            writeLog(`프로그램 실행 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        });
        break;
    default:
        console.log(`
사용 가능한 명령어:
--delete : Blogs 컬렉션의 모든 데이터 삭제
--test   : 테스트 모드로 실행 (Firebase 저장 건너뜀)
--crawl  : 전체 블로그 크롤링
        `);
} 