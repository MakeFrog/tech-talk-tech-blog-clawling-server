import { crawlBlog } from '../main';
import { blogConfigs } from '../crawl_config';
import { formatCrawlingResult, sendSlackMessage } from '../webHook/slack';

async function testCrawling() {
    console.log('크롤링 테스트 시작...');

    const results = [];

    // 모든 블로그 설정에 대해 크롤링 실행
    for (const config of Object.values(blogConfigs)) {
        console.log(`\n[${config.name}] 크롤링 시작...`);

        try {
            // isTestMode를 false로 설정하여 실제 Firebase에 저장
            const result = await crawlBlog(config, false);
            results.push(result);

            console.log(`[${config.name}] 크롤링 결과:`, result);
        } catch (error) {
            console.error(`[${config.name}] 크롤링 중 오류 발생:`, error);
            results.push({
                blogName: config.name,
                total: 0,
                skipped: 0,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    // 결과를 Slack으로 전송
    try {
        const message = formatCrawlingResult(results);
        console.log('\n전송할 Slack 메시지:', message);
        await sendSlackMessage(message);
        console.log('Slack 메시지 전송 완료');
    } catch (error) {
        console.error('Slack 메시지 전송 실패:', error);
    }
}

// 테스트 실행
testCrawling().catch(console.error); 