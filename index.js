const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// axios 기본 설정
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    },
    timeout: 10000
});

// RSS 파서 설정
const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/atom+xml,application/xml,text/xml,application/rss+xml'
    },
    customFields: {
        item: [
            ['content:encoded', 'contentEncoded'],
            ['description', 'description'],
            ['summary', 'summary'],
            ['subtitle', 'subtitle']
        ]
    }
});

// 로그 디렉토리 생성
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 로그 파일 경로
const logFile = path.join(logDir, `crawling_${new Date().toISOString().split('T')[0]}.log`);

// 로그 작성 함수
function writeLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(logFile, logMessage);
}

// Firebase 초기화
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Blogs 컬렉션의 모든 문서와 서브컬렉션 삭제
async function deleteAllDocuments() {
    writeLog('기존 데이터 삭제 시작');
    const snapshot = await db.collection('Blogs').get();
    let batch = db.batch();
    let count = 0;

    // 각 문서와 서브컬렉션 삭제
    for (const doc of snapshot.docs) {
        try {
            // Content 서브컬렉션의 모든 문서 가져오기
            const contentSnapshot = await doc.ref.collection('Content').get();

            // Content 서브컬렉션의 각 문서 삭제
            contentSnapshot.docs.forEach((contentDoc) => {
                batch.delete(contentDoc.ref);
            });

            // 메인 문서 삭제
            batch.delete(doc.ref);
            count++;

            // Firestore 배치 작업 제한(500)에 도달하면 커밋
            if (count % 450 === 0) {
                await batch.commit();
                writeLog(`${count}개의 문서 삭제 중...`);
                batch = db.batch(); // 새로운 배치 시작
            }
        } catch (error) {
            writeLog(`문서 삭제 중 오류 발생 (${doc.id}): ${error.message}`);
        }
    }

    // 남은 문서들 삭제
    if (count % 450 !== 0) {
        await batch.commit();
    }

    writeLog(`${count}개의 문서와 서브컬렉션 삭제 완료`);
}

// URL을 document ID로 변환하는 함수
function urlToDocId(url) {
    // URL에서 프로토콜(http:// 또는 https://)을 제거
    const cleanUrl = url.replace(/^https?:\/\//, '');
    // 특수문자를 제거하거나 다른 문자로 대체
    return cleanUrl.replace(/[/]/g, '_');
}

// 블로그별 본문 추출 설정
const blogConfigs = {
    'kakao': {
        name: 'KAKAO',
        feedUrl: 'https://tech.kakao.com/feed/',
        authorSelector: '.author',
        async extractContent($, url, item) {
            // RSS 피드의 description 파싱
            let description = '';
            let content = '';
            const possibleDescFields = ['description', 'summary', 'subtitle', 'contentEncoded'];

            for (const field of possibleDescFields) {
                if (item[field]) {
                    description = item[field]
                        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')  // CDATA 제거
                        .replace(/<[^>]*>/g, '')  // HTML 태그 제거
                        .trim();

                    if (description.length > 50) {  // 의미 있는 길이의 설명을 찾으면 중단
                        break;
                    }
                }
            }

            try {
                // RSS 피드의 content를 우선 사용
                content = item.contentEncoded || item.content || '';

                // content가 없거나 너무 짧은 경우에만 실제 페이지에서 가져오기 시도
                if (!content || content.length < 200) {
                    // 실제 페이지에서 본문 가져오기
                    const response = await axiosInstance.get(url);
                    const $ = cheerio.load(response.data);

                    // description이 없거나 너무 짧은 경우, 메타 태그나 본문에서 추출
                    if (!description || description.length < 50) {
                        description = $('meta[property="og:description"]').attr('content') ||
                            $('meta[name="description"]').attr('content');

                        if (!description || description.length < 50) {
                            const contentForDesc = $('.inner_content p').first().text() ||
                                $('.inner_content').text();

                            if (contentForDesc) {
                                description = contentForDesc
                                    .replace(/\s+/g, ' ')
                                    .trim()
                                    .substring(0, 200) + '...';
                            }
                        }
                    }

                    // 본문 추출
                    const contentSelectors = [
                        '.preview',                        // 새로운 레이아웃
                        'article .content',                // 이전 레이아웃
                        '.inner_content',                  // 전체 콘텐츠 영역
                        '.entry-content',                  // 대체 레이아웃
                        'article'                          // 전체 article
                    ];

                    for (const selector of contentSelectors) {
                        const element = $(selector);
                        if (element.length) {
                            // 불필요한 요소 제거
                            element.find('script, style, .wrap_tit, .box_author, .box_btn, .cont_other, .box_giscus').remove();

                            // 본문 내용 추출
                            const extractedContent = element.html();

                            // 의미 있는 길이의 본문을 찾으면 중단
                            if (extractedContent && extractedContent.length > 200) {
                                // HTML 태그 정리
                                content = extractedContent
                                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')  // script 태그 제거
                                    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')     // style 태그 제거
                                    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')                        // CDATA 제거
                                    .trim();
                                break;
                            }
                        }
                    }
                }

                return {
                    description,
                    content
                };
            } catch (error) {
                writeLog(`본문 가져오기 실패 (${url}): ${error.message}`);
                return {
                    description,
                    content: item.contentEncoded || item.content || ''
                };
            }
        },
        async extractThumbnail($, url, item) {
            // RSS 피드의 thumbnail 필드 확인
            if (item.thumbnail) {
                return item.thumbnail;
            }

            try {
                // 페이지에서 og:image 또는 twitter:image 확인
                const response = await axiosInstance.get(url);
                const $ = cheerio.load(response.data);

                // 대표 이미지 찾기
                const ogImage = $('meta[property="og:image"]').attr('content');
                const twitterImage = $('meta[name="twitter:image"]').attr('content');
                const firstImage = $('article img').first().attr('src');

                return ogImage || twitterImage || firstImage || '';
            } catch (error) {
                writeLog(`썸네일 추출 실패 (${url}): ${error.message}`);
                return '';
            }
        }
    },
    'naverD2': {
        name: 'NAVER D2',
        feedUrl: 'https://d2.naver.com/d2.atom',
        authorSelector: '.content__author',
        async extractContent($, url, item) {
            // RSS 피드의 description 파싱
            let description = '';
            let content = '';

            try {
                // 네이버 D2 블로그인 경우
                if (url.includes('d2.naver.com')) {
                    if (item.content) {
                        content = item.content;
                        const $content = cheerio.load(content);

                        // FE News 글인 경우 특별 처리
                        if (url.includes('/news/') || item.title.includes('FE News')) {
                            // 주요내용 섹션 이후의 첫 번째 유효한 문단 찾기
                            let foundMainContent = false;
                            const paragraphs = $content('p').toArray();

                            for (const p of paragraphs) {
                                const text = $(p).text().trim();
                                if (text.includes('주요내용')) {
                                    foundMainContent = true;
                                    continue;
                                }
                                if (foundMainContent && text.length > 0 && !text.includes('FE News') && !text.includes('◎')) {
                                    description = text.substring(0, 200).trim() + '...';
                                    break;
                                }
                            }

                            // 주요내용 섹션을 찾지 못한 경우 대체 방법 시도
                            if (!description) {
                                const firstValidParagraph = $content('p').filter((i, el) => {
                                    const text = $(el).text().trim();
                                    return text.length > 50 && !text.includes('FE News') && !text.includes('주요내용') && !text.includes('◎');
                                }).first().text();

                                if (firstValidParagraph) {
                                    description = firstValidParagraph.substring(0, 200).trim() + '...';
                                }
                            }
                        } else {
                            const firstParagraph = $content('p').first().text();
                            if (firstParagraph && firstParagraph.length > 50) {
                                description = firstParagraph.substring(0, 200).trim() + '...';
                            }
                        }
                    }

                    // description이 없거나 너무 짧은 경우 메타 태그나 본문에서 추출
                    if (!description || description.length < 50) {
                        const response = await axiosInstance.get(url);
                        const $ = cheerio.load(response.data);

                        description = $('meta[property="og:description"]').attr('content') ||
                            $('meta[name="description"]').attr('content');

                        if (!description || description.length < 50) {
                            const contentForDesc = $('.content__body p').filter((i, el) => {
                                const text = $(el).text().trim();
                                return text.length > 50 && !text.includes('FE News') && !text.includes('주요내용') && !text.includes('◎');
                            }).first().text();

                            if (contentForDesc) {
                                description = contentForDesc
                                    .replace(/\s+/g, ' ')
                                    .trim()
                                    .substring(0, 200) + '...';
                            }
                        }
                    }
                }

                return {
                    description: description || '내용 없음',
                    content: content || ''
                };
            } catch (error) {
                writeLog(`본문 가져오기 실패 (${url}): ${error.message}`);
                return {
                    description: description || '내용 없음',
                    content: content || ''
                };
            }
        },
        async extractThumbnail($, url, item) {
            try {
                // RSS 피드의 content에서 첫 번째 이미지 URL 추출
                if (item.content) {
                    const $content = cheerio.load(item.content);
                    const firstImage = $content('img').first();
                    let imageUrl = firstImage.attr('src');

                    // 상대 경로를 절대 경로로 변환
                    if (imageUrl && imageUrl.startsWith('/')) {
                        imageUrl = `https://d2.naver.com${imageUrl}`;
                    }

                    if (imageUrl) {
                        return imageUrl;
                    }
                }

                // 실제 페이지에서 이미지 추출 시도
                const response = await axiosInstance.get(url);
                const $ = cheerio.load(response.data);

                const ogImage = $('meta[property="og:image"]').attr('content');
                const firstContentImage = $('.content__body img').first().attr('src');

                let imageUrl = ogImage || firstContentImage;

                if (imageUrl && imageUrl.startsWith('/')) {
                    imageUrl = `https://d2.naver.com${imageUrl}`;
                }

                return imageUrl || null;
            } catch (error) {
                writeLog(`썸네일 추출 실패 (${url}): ${error.message}`);
                return null;
            }
        }
    }
};

// HTML에서 텍스트만 추출하는 함수
function extractText($, element) {
    let text = $(element)
        .clone()
        .find('script, style, svg, iframe').remove().end()
        .find('pre, code').each(function () {
            // 코드 블록은 줄바꿈 유지
            const $this = $(this);
            $this.text($this.text().trim());
        }).end()
        .find('h1, h2, h3, h4, h5, h6, p').each(function () {
            // 제목과 문단 뒤에 줄바꿈 추가
            const $this = $(this);
            $this.append('\n\n');
        }).end()
        .text();

    // 연속된 줄바꿈 정리
    return text
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s+/g, ' ')
        .trim();
}

// RSS 파서 설정 업데이트
const getParser = (blogConfig) => {
    return new Parser({
        headers: blogConfig.headers || {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        customFields: {
            item: [
                ['content:encoded', 'content']
            ]
        }
    });
};

// 크롤링 함수 업데이트
async function crawlBlog(blogConfig) {
    try {
        writeLog(`시작: ${blogConfig.name} 크롤링 시작`);

        // RSS 피드 파싱
        const feed = await parser.parseURL(blogConfig.feedUrl);
        writeLog(`피드 파싱 완료: ${blogConfig.name} - ${feed.items.length}개의 글 발견`);

        // 각 글 처리
        for (const item of feed.items) {
            try {
                writeLog(`크롤링 중: ${item.title}`);

                // 본문 가져오기
                const $ = cheerio.load(item.content || '');
                const contentResult = await blogConfig.extractContent($, item.link, item);

                // HTML 태그를 제외한 순수 텍스트 길이 계산
                const textContent = contentResult.content.replace(/<[^>]*>/g, '').trim();
                const textDescription = contentResult.description.replace(/<[^>]*>/g, '').trim();

                // 썸네일 이미지 URL 가져오기
                const thumbnailUrl = await blogConfig.extractThumbnail($, item.link, item);

                // 문서 ID 생성
                const docId = urlToDocId(item.link);
                const docRef = db.collection('Blogs').doc(docId);

                // Firestore에 저장할 데이터 준비
                const postData = {
                    id: docId,
                    title: item.title,
                    linkUrl: item.link,
                    publishDate: admin.firestore.Timestamp.fromDate(new Date(item.pubDate || item.isoDate)),
                    author: blogConfig.authorSelector ? $(blogConfig.authorSelector).text().trim() : blogConfig.name,
                    blogName: blogConfig.name,
                    description: textDescription || '내용 없음',
                    thumbnailUrl: thumbnailUrl,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                // Content 서브컬렉션에 저장할 데이터
                const contentData = {
                    text: textContent
                };

                // Firestore에 저장 (트랜잭션 사용)
                await db.runTransaction(async (transaction) => {
                    // 메인 문서 저장
                    transaction.set(docRef, postData);

                    // Content 서브컬렉션에 저장
                    const contentDocRef = docRef.collection('Content').doc('content');
                    transaction.set(contentDocRef, contentData);
                });

                writeLog(`저장 완료: ${item.title} (본문 길이: ${textContent.length}자, 요약 길이: ${textDescription.length}자, 썸네일: ${thumbnailUrl ? '있음' : '없음'})`);

                // 크롤링 간격 추가
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                writeLog(`에러 발생 (개별 글): ${item.title} - ${error.message}`);
            }
        }

        writeLog(`완료: ${blogConfig.name} 크롤링 완료`);
    } catch (error) {
        writeLog(`에러 발생 (블로그): ${blogConfig.name} - ${error.message}`);
    }
}

async function startCrawling() {
    writeLog('크롤링 프로세스 시작');
    for (const config of Object.values(blogConfigs)) {
        writeLog(`블로그 처리 시작: ${config.name}`);
        await crawlBlog(config);
    }
    writeLog('크롤링 프로세스 완료');
}

// 명령어 처리
const command = process.argv[2];
switch (command) {
    case '--delete':
        deleteAllDocuments();
        break;
    case '--test':
        writeLog('테스트 모드로 실행됨');
        startCrawling();
        break;
    case '--crawl':
        startCrawling();
        break;
    default:
        console.log(`
사용 가능한 명령어:
--delete : Blogs 컬렉션의 모든 데이터 삭제
--test   : 테스트 모드로 실행 (카카오 블로그만 크롤링)
--crawl  : 전체 블로그 크롤링
        `);
}