import { onSchedule } from 'firebase-functions/v2/scheduler';
import { crawlBlog } from '../main';
import { blogConfigs } from '../crawl_config';
import { writeLog } from '../utils/logger';

// 매일 오후 9시(KST)에 실행되는 스케줄링된 함수
export const scheduledCrawling = onSchedule({
    schedule: '0 21 * * *',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
}, async (_context) => {
    try {
        writeLog('스케줄링된 크롤링 작업 시작');

        // 모든 블로그 설정에 대해 크롤링 실행
        for (const [blogId, config] of Object.entries(blogConfigs)) {
            await crawlBlog(config, false);
        }

        writeLog('스케줄링된 크롤링 작업 완료');
    } catch (error) {
        writeLog(`스케줄링된 크롤링 작업 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}); 