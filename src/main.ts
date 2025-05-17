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

                // 로그 출력ㄱ
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
                        link_url: item.link,
                        publish_date: Timestamp.fromDate(new Date(item.pubDate || item.isoDate || new Date())),
                        author: author,
                        blog_id: blogConfig.id,
                        blog_name: blogConfig.name,
                        is_company: true,
                        description: contentResult.description || '',
                        thumbnail_url: thumbnailUrl,
                        is_valid: analysisResult.isValid,
                        related_skill_ids: analysisResult.skillIds,
                        related_job_group_ids: analysisResult.jobGroupIds,
                        random: Array.from({ length: 5 }, (_, i) => ({
                            [i + 1]: Math.random()
                        })).reduce((acc, curr) => ({ ...acc, ...curr }), {}),
                        created_at: FieldValue.serverTimestamp(),
                        updated_at: FieldValue.serverTimestamp()
                    });

                    // 컨텐츠 서브컬렉션 데이터
                    batch.set(contentRef, {
                        text: textContent
                    });

                    // Skill Collection의 blog_content_count 증가
                    for (const skillId of analysisResult.skillIds) {
                        const skillRef = db.collection('Skill').doc(skillId);
                        batch.update(skillRef, {
                            blog_content_count_ko: FieldValue.increment(1)
                        });
                    }

                    // JobGroup Collection의 blog_content_count 증가
                    for (const jobGroupId of analysisResult.jobGroupIds) {
                        const jobGroupRef = db.collection('JobGroup').doc(jobGroupId);
                        batch.update(jobGroupRef, {
                            blog_content_count_ko: FieldValue.increment(1)
                        });
                    }

                    batchCount += 2 + analysisResult.skillIds.length + analysisResult.jobGroupIds.length;  // 메인 문서, 컨텐츠 문서, 스킬 및 직군 업데이트 수 합산
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
    const targetFunction = process.argv.find((arg) => arg.startsWith('--function='))?.split('=')[1];

    console.log('실행 시작');
    console.log(`실행 모드: ${isTestMode ? '테스트' : '프로덕션'}`);
    console.log(`대상 함수: ${targetFunction || '크롤링'}`);

    if (targetFunction === 'updateCompanyFieldNames') {
        console.log('Company 컬렉션 필드명 변경 시작');
        await updateCompanyFieldNames();
        return;
    } else if (targetFunction === 'updateCompanyNames') {
        console.log('Company 컬렉션 이름 변경 시작');
        await updateCompanyNames();
        return;
    }

    // 기존 크롤링 로직
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

// 임시 함수: company_name을 blog_name으로 변경하고 is_company 추가
export async function updateCompanyNameField(): Promise<void> {
    try {
        if (!initializeFirebase()) {
            throw new Error('Firebase 초기화 실패');
        }

        const blogsRef = db.collection('Blogs');
        const snapshot = await blogsRef.get();
        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const updates: { [key: string]: any } = {
                blog_name: data.company_name,
                is_company: true,
                updated_at: FieldValue.serverTimestamp()
            };

            // 이전 필드 삭제
            const deletes: { [key: string]: FieldValue } = {
                company_name: FieldValue.delete()
            };

            batch.update(doc.ref, { ...updates, ...deletes });

            count++;
            totalUpdated++;

            // Firestore 배치 제한(500)에 도달하면 커밋
            if (count >= 498) {
                await batch.commit();
                writeLog(`${count}개 문서 필드명 변경 완료`);
                batch = db.batch();
                count = 0;
            }
        }

        // 남은 배치 처리
        if (count > 0) {
            await batch.commit();
            writeLog(`남은 ${count}개 문서 필드명 변경 완료`);
        }

        writeLog(`총 ${totalUpdated}개 문서의 필드명 변경 완료`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writeLog(`필드명 변경 중 오류 발생: ${errorMessage}`);
        throw error;
    }
}

// 임시 함수: related_skills와 related_job_groups 필드명 변경
export async function updateRelatedFieldNames(): Promise<void> {
    try {
        if (!initializeFirebase()) {
            throw new Error('Firebase 초기화 실패');
        }

        const blogsRef = db.collection('Blogs');
        const snapshot = await blogsRef.get();
        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const updates: { [key: string]: any } = {
                related_skill_ids: data.related_skills,
                related_job_group_ids: data.related_job_groups,
                updated_at: FieldValue.serverTimestamp()
            };

            // 이전 필드 삭제
            const deletes: { [key: string]: FieldValue } = {
                related_skills: FieldValue.delete(),
                related_job_groups: FieldValue.delete()
            };

            batch.update(doc.ref, { ...updates, ...deletes });

            count++;
            totalUpdated++;

            // Firestore 배치 제한(500)에 도달하면 커밋
            if (count >= 498) {
                await batch.commit();
                writeLog(`${count}개 문서 필드명 변경 완료`);
                batch = db.batch();
                count = 0;
            }
        }

        // 남은 배치 처리
        if (count > 0) {
            await batch.commit();
            writeLog(`남은 ${count}개 문서 필드명 변경 완료`);
        }

        writeLog(`총 ${totalUpdated}개 문서의 필드명 변경 완료`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writeLog(`필드명 변경 중 오류 발생: ${errorMessage}`);
        throw error;
    }
}

// 임시 함수: 기존 문서의 스킬과 직군 카운트 업데이트
export async function updateContentCountFields(): Promise<void> {
    try {
        if (!initializeFirebase()) {
            throw new Error('Firebase 초기화 실패');
        }

        // 모든 스킬과 직군 ID 목록 (gemini.ts에서 사용하는 목록과 동일)
        const allSkillIds = [
            'apollo', 'armeria', 'aspnet', 'awskinesis', 'awsses', 'awssns', 'awssqs', 'celery',
            'codeigniter', 'django', 'dropwizard', 'echo', 'expressjs', 'falcon', 'fastapi', 'fastify',
            'fiber', 'flask', 'gin', 'grpc', 'hibernate', 'koa', 'ktor', 'laravel', 'liquibase',
            'mybatis', 'nestjs', 'netty', 'nodejs', 'phoenix', 'rabbitmq', 'rubyonrails', 'sanic',
            'spring', 'springboot', 'swagger', 'thrift', 'webrtc', 'datastructure', 'database',
            'operatingsystem', 'network', 'airflow', 'awsathena', 'awsredshift', 'clickhouse', 'druid',
            'flink', 'fluentd', 'googlebigquery', 'googledatastudio', 'grafana', 'hadoop', 'hazelcast',
            'hbase', 'hive', 'impala', 'kafka', 'keras', 'kibana', 'kubeflow', 'kudu', 'looker', 'luigi',
            'metabase', 'mlflow', 'nifi', 'presto', 'prometheus', 'pytorch', 'ranger', 'ray', 'redash',
            'snowflake', 'spark', 'superset', 'tableau', 'tensorflow', 'trino', 'zeppelin', 'zipkin',
            'arangodb', 'arcus', 'awsauroradb', 'awsdocumentdb', 'awsdynamodb', 'awsmariadb', 'cassandradb',
            'ceph', 'cockroachdb', 'couchbase', 'cubrid', 'elasticsearch', 'greenplum', 'h2', 'influxdb',
            'memcached', 'mongodb', 'mssql', 'mysql', 'neo4j', 'oracledb', 'postgresql', 'redis', 'rocksdb',
            'solr', 'angular', 'backbonejs', 'docusaurus', 'electron', 'emberjs', 'emotion', 'gatsby',
            'graphql', 'hugo', 'immer', 'jotai', 'meteor', 'mobx', 'nextjs', 'nuxtjs', 'opengl', 'reactivex',
            'react', 'reactquery', 'recoil', 'redux', 'relay', 'storybook', 'styledcomponents', 'svelte',
            'tailwind', 'unity', 'vuejs', 'vuex', 'zustand', 'webfrontend', 'clojure', 'cplusplus', 'csharp',
            'dart', 'elixir', 'go', 'groovy', 'java', 'javascript', 'kotlin', 'lua', 'objectivec', 'perl',
            'php', 'python', 'r', 'rescript', 'ruby', 'rust', 'scala', 'swift', 'typescript', 'alamofire',
            'bazel', 'bitrise', 'dagger', 'exoplayer', 'fastlane', 'flutter', 'glide', 'googlefirebase',
            'googlefirestore', 'lottie', 'moya', 'reactnative', 'reactorkit', 'realm', 'retrofit', 'ribs',
            'snapkit', 'tuist', 'android', 'ios'
        ];

        const allJobGroupIds = [
            'software-engineer', 'web-developer', 'server-developer', 'frontend-developer',
            'java-developer', 'c-cplusplus-developer', 'python-developer', 'machine-learning-engineer',
            'system-network-administrator', 'android-developer', 'data-engineer',
            'devops-system-administrator', 'nodejs-developer', 'ios-developer', 'embedded-developer',
            'technical-support', 'development-manager', 'data-scientist', 'qa-test-engineer',
            'hardware-engineer', 'big-data-engineer', 'security-engineer', 'product-manager',
            'cross-platform-app-developer', 'blockchain-platform-engineer', 'dba', 'dotnet-developer',
            'php-developer', 'audio-video-engineer', 'web-publisher', 'erp-specialist',
            'graphics-engineer', 'vr-engineer', 'bi-engineer', 'ruby-on-rails-developer'
        ];

        const blogsRef = db.collection('Blogs');
        const snapshot = await blogsRef.get();

        // 각 스킬과 직군별 카운트를 집계
        const skillCounts: { [key: string]: number } = {};
        const jobGroupCounts: { [key: string]: number } = {};

        // 모든 가능한 ID에 대해 0으로 초기화
        allSkillIds.forEach(id => skillCounts[id] = 0);
        allJobGroupIds.forEach(id => jobGroupCounts[id] = 0);

        // 모든 문서를 순회하며 카운트 집계
        for (const doc of snapshot.docs) {
            const data = doc.data();

            // 스킬 카운트
            const skillIds = data.related_skill_ids || [];
            for (const skillId of skillIds) {
                skillCounts[skillId] = (skillCounts[skillId] || 0) + 1;
            }

            // 직군 카운트
            const jobGroupIds = data.related_job_group_ids || [];
            for (const jobGroupId of jobGroupIds) {
                jobGroupCounts[jobGroupId] = (jobGroupCounts[jobGroupId] || 0) + 1;
            }
        }

        // 배치로 업데이트 실행
        let batch = db.batch();
        let batchCount = 0;
        let totalUpdated = 0;

        // 스킬 카운트 업데이트
        for (const [skillId, count] of Object.entries(skillCounts)) {
            const skillRef = db.collection('Skill').doc(skillId);
            const skillDoc = await skillRef.get();

            if (!skillDoc.exists) {
                // 문서가 없는 경우 생성
                batch.set(skillRef, {
                    blog_content_count_ko: count
                });
            } else {
                // 문서가 있는 경우 업데이트
                batch.update(skillRef, {
                    blog_content_count_ko: count
                });
            }

            batchCount++;
            totalUpdated++;

            // Firestore 배치 제한(500)에 도달하면 커밋
            if (batchCount >= 498) {
                await batch.commit();
                writeLog(`${batchCount}개 문서 카운트 업데이트 완료`);
                batch = db.batch();
                batchCount = 0;
            }
        }

        // 직군 카운트 업데이트
        for (const [jobGroupId, count] of Object.entries(jobGroupCounts)) {
            const jobGroupRef = db.collection('JobGroup').doc(jobGroupId);
            const jobGroupDoc = await jobGroupRef.get();

            if (!jobGroupDoc.exists) {
                // 문서가 없는 경우 생성
                batch.set(jobGroupRef, {
                    blog_content_count_ko: count
                });
            } else {
                // 문서가 있는 경우 업데이트
                batch.update(jobGroupRef, {
                    blog_content_count_ko: count
                });
            }

            batchCount++;
            totalUpdated++;

            // Firestore 배치 제한(500)에 도달하면 커밋
            if (batchCount >= 498) {
                await batch.commit();
                writeLog(`${batchCount}개 문서 카운트 업데이트 완료`);
                batch = db.batch();
                batchCount = 0;
            }
        }

        // 남은 배치 처리
        if (batchCount > 0) {
            await batch.commit();
            writeLog(`남은 ${batchCount}개 문서 카운트 업데이트 완료`);
        }

        writeLog(`총 ${totalUpdated}개의 카운트 업데이트 완료 (스킬: ${Object.keys(skillCounts).length}개, 직군: ${Object.keys(jobGroupCounts).length}개)`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writeLog(`카운트 업데이트 중 오류 발생: ${errorMessage}`);
        throw error;
    }
}

// 임시 함수: blog_content_count를 blog_content_count_ko로 변경
export async function updateContentCountFieldName(): Promise<void> {
    try {
        if (!initializeFirebase()) {
            throw new Error('Firebase 초기화 실패');
        }

        // Skill 컬렉션 업데이트
        const skillsRef = db.collection('Skill');
        const skillsSnapshot = await skillsRef.get();
        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        for (const doc of skillsSnapshot.docs) {
            const data = doc.data();
            const updates: { [key: string]: any } = {
                blog_content_count_ko: data.blog_content_count || 0
            };

            // 이전 필드 삭제
            const deletes: { [key: string]: FieldValue } = {
                blog_content_count: FieldValue.delete()
            };

            batch.update(doc.ref, { ...updates, ...deletes });

            count++;
            totalUpdated++;

            if (count >= 498) {
                await batch.commit();
                writeLog(`${count}개의 Skill 문서 필드명 변경 완료`);
                batch = db.batch();
                count = 0;
            }
        }

        // JobGroup 컬렉션 업데이트
        const jobGroupsRef = db.collection('JobGroup');
        const jobGroupsSnapshot = await jobGroupsRef.get();

        for (const doc of jobGroupsSnapshot.docs) {
            const data = doc.data();
            const updates: { [key: string]: any } = {
                blog_content_count_ko: data.blog_content_count || 0
            };

            // 이전 필드 삭제
            const deletes: { [key: string]: FieldValue } = {
                blog_content_count: FieldValue.delete()
            };

            batch.update(doc.ref, { ...updates, ...deletes });

            count++;
            totalUpdated++;

            if (count >= 498) {
                await batch.commit();
                writeLog(`${count}개의 문서 필드명 변경 완료`);
                batch = db.batch();
                count = 0;
            }
        }

        // 남은 배치 처리
        if (count > 0) {
            await batch.commit();
            writeLog(`남은 ${count}개 문서 필드명 변경 완료`);
        }

        writeLog(`총 ${totalUpdated}개 문서의 필드명 변경 완료`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writeLog(`필드명 변경 중 오류 발생: ${errorMessage}`);
        throw error;
    }
}

// 임시 함수: CompanyBlogs 컬렉션을 Company 컬렉션으로 복사
export async function migrateToCompanyCollection(): Promise<void> {
    try {
        if (!initializeFirebase()) {
            throw new Error('Firebase 초기화 실패');
        }

        const companyBlogsRef = db.collection('CompanyBlogs');
        const snapshot = await companyBlogsRef.get();
        let batch = db.batch();
        let count = 0;
        let totalMigrated = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const companyRef = db.collection('Company').doc(doc.id);
            batch.set(companyRef, data);

            count++;
            totalMigrated++;

            if (count >= 498) {
                await batch.commit();
                writeLog(`${count}개의 문서 마이그레이션 완료`);
                batch = db.batch();
                count = 0;
            }
        }

        // 남은 배치 처리
        if (count > 0) {
            await batch.commit();
            writeLog(`남은 ${count}개 문서 마이그레이션 완료`);
        }

        writeLog(`총 ${totalMigrated}개의 문서 마이그레이션 완료`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writeLog(`마이그레이션 중 오류 발생: ${errorMessage}`);
        throw error;
    }
}

// 임시 함수: 블로그 로고 이미지 업로드 및 URL 업데이트
export async function updateBlogLogoUrls(): Promise<void> {
    try {
        if (!initializeFirebase()) {
            throw new Error('Firebase 초기화 실패');
        }

        // 환경에 따른 버킷 이름 설정
        const bucketName = process.env.FIREBASE_ENV === 'dev' ? 'techtalk-dev-33.appspot.com' : 'techtalk-prod-32.appspot.com';
        const bucket = admin.storage().bucket(bucketName);
        const companyBlogsRef = db.collection('CompanyBlogs');
        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        // CompanyBlogs 컬렉션의 모든 문서 조회
        const snapshot = await companyBlogsRef.get();

        for (const doc of snapshot.docs) {
            const blogId = doc.id;
            const localFilePath = `src/blogLogo/${blogId}.png`;

            try {
                // Storage에 이미지 업로드
                const [file] = await bucket.upload(localFilePath, {
                    destination: `blog-logos/${blogId}.png`,
                    metadata: {
                        contentType: 'image/png',
                        cacheControl: 'public, max-age=31536000' // 1년
                    }
                });

                // 공개 URL 생성
                const [url] = await file.getSignedUrl({
                    action: 'read',
                    expires: '01-01-2100' // 충분히 먼 미래 날짜
                });

                // Firestore 문서 업데이트
                batch.update(doc.ref, {
                    logoUrl: url
                });

                count++;
                totalUpdated++;

                writeLog(`${blogId} 로고 이미지 업로드 완료`);

                // Firestore 배치 제한(500)에 도달하면 커밋
                if (count >= 498) {
                    await batch.commit();
                    writeLog(`${count}개의 로고 URL 업데이트 완료`);
                    batch = db.batch();
                    count = 0;
                }
            } catch (error) {
                writeLog(`${blogId} 로고 이미지 처리 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
        }

        // 남은 배치 처리
        if (count > 0) {
            await batch.commit();
            writeLog(`남은 ${count}개의 로고 URL 업데이트 완료`);
        }

        writeLog(`총 ${totalUpdated}개의 블로그 로고 URL 업데이트 완료`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writeLog(`블로그 로고 URL 업데이트 중 오류 발생: ${errorMessage}`);
        throw error;
    }
}

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

// 임시 함수: Company 컬렉션의 필드명을 snake_case로 변경
export async function updateCompanyFieldNames(): Promise<void> {
    try {
        if (!initializeFirebase()) {
            console.log('Firebase 초기화 실패');
            throw new Error('Firebase 초기화 실패');
        }
        console.log('Firebase 초기화 성공');

        const companyRef = db.collection('Company');
        const snapshot = await companyRef.get();
        console.log(`총 ${snapshot.size}개의 문서를 찾았습니다.`);

        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            console.log(`문서 처리 중: ${doc.id}`);

            // 업데이트할 필드
            const updates: { [key: string]: any } = {
                feed_url: data.feedUrl,
                logo_url: data.logoUrl,
                feedUrl: FieldValue.delete(),
                logoUrl: FieldValue.delete()
            };

            batch.update(doc.ref, updates);

            count++;
            totalUpdated++;

            if (count >= 498) {
                console.log(`${count}개의 문서 일괄 처리 중...`);
                await batch.commit();
                console.log(`${count}개의 문서 필드명 변경 완료`);
                batch = db.batch();
                count = 0;
            }
        }

        // 남은 배치 처리
        if (count > 0) {
            console.log(`남은 ${count}개 문서 일괄 처리 중...`);
            await batch.commit();
            console.log(`남은 ${count}개 문서 필드명 변경 완료`);
        }

        console.log(`총 ${totalUpdated}개의 문서 필드명 변경 완료`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`필드명 변경 중 오류 발생: ${errorMessage}`);
        throw error;
    }
}

// Company 컬렉션의 name 필드 업데이트
export async function updateCompanyNames(): Promise<void> {
    try {
        if (!initializeFirebase()) {
            console.log('Firebase 초기화 실패');
            throw new Error('Firebase 초기화 실패');
        }
        console.log('Firebase 초기화 성공');

        const companyRef = db.collection('Company');
        const snapshot = await companyRef.get();
        console.log(`총 ${snapshot.size}개의 문서를 찾았습니다.`);

        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        // 회사명 매핑
        const nameMapping: { [key: string]: string } = {
            '29cm': '29CM',
            'bespin-security': '베스핀글로벌',
            'bunjang': '번개장터',
            'chunmyung': '천명',
            'class101': '클래스101',
            'coupang': '쿠팡',
            'daangn': '당근',
            'elecle': '일렉클',
            'enlighten': '엔라이튼',
            'heydealer': '헤이딜러',
            'idus': '아이디어스',
            'jobkorea': '잡코리아',
            'lemonbase': '레몬베이스',
            'line': '라인',
            'megazone': '메가존',
            'mildang': '밀당',
            'musinsa': '무신사',
            'myrealtrip': '마이리얼트립',
            'naver-place': '네이버플레이스',
            'naver_d2': '네이버',
            'pinkfong': '핑크퐁',
            'riiid': '뤼이드',
            'sixshop': '식스샵',
            'soomgo': '숨고',
            'spoon': '스푼',
            'ssg': 'SSG',
            'styleshare': '스타일쉐어',
            'tving': '티빙',
            'wanted': '원티드',
            'watcha': '왓챠',
            'woowahan': '우아한형제들',
            'yanolja': '야놀자',
            'zigbang': '직방'
        };

        for (const doc of snapshot.docs) {
            const companyId = doc.id;
            const newName = nameMapping[companyId];

            if (!newName) {
                console.log(`경고: ${companyId}에 대한 새로운 이름을 찾을 수 없습니다.`);
                continue;
            }

            console.log(`문서 처리 중: ${companyId} -> ${newName}`);

            batch.update(doc.ref, {
                name: newName
            });

            count++;
            totalUpdated++;

            if (count >= 498) {
                console.log(`${count}개의 문서 일괄 처리 중...`);
                await batch.commit();
                console.log(`${count}개의 문서 이름 변경 완료`);
                batch = db.batch();
                count = 0;
            }
        }

        // 남은 배치 처리
        if (count > 0) {
            console.log(`남은 ${count}개 문서 일괄 처리 중...`);
            await batch.commit();
            console.log(`남은 ${count}개 문서 이름 변경 완료`);
        }

        console.log(`총 ${totalUpdated}개의 문서 이름 변경 완료`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`이름 변경 중 오류 발생: ${errorMessage}`);
        throw error;
    }
}

// 스크립트가 직접 실행될 때 main 함수 호출
if (require.main === module) {
    main().catch(console.error);
}