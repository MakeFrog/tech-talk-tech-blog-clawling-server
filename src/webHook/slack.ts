import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface CrawlingResult {
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
}

export const formatCrawlingResult = (results: CrawlingResult[]): string => {
    const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const header = `🤖 크롤링 결과 (${timestamp})\n`;

    const body = results
        .map(result => {
            if (result.success) {
                return `✅ ${result.blogName}: ${result.total}개의 새로운 포스트 크롤링 완료 (${result.skipped}개 스킵)`;
            } else {
                return `❌ ${result.blogName}: 크롤링 실패 (${result.error || '알 수 없는 오류'})`;
            }
        })
        .join('\n');

    // 총계 계산
    const totalNewPosts = results.reduce((sum, result) => sum + result.total, 0);
    const totalFailedPosts = results.reduce((sum, result) => sum + (result.failedPosts?.length || 0), 0);

    // 실패한 포스트 상세 정보
    let failedPostsDetail = '';
    if (totalFailedPosts > 0) {
        failedPostsDetail = '\n\n❌ 추출 실패한 포스트:\n' + results
            .filter(result => result.failedPosts && result.failedPosts.length > 0)
            .map(result => result.failedPosts!.map(post =>
                `• [${result.blogName}] ${post.title || '제목 없음'}\n  ${post.url || 'URL 없음'}\n  사유: ${post.reason}`
            ).join('\n'))
            .join('\n');
    }

    const summary = `\n\n📊 요약\n• 추가된 총 포스트: ${totalNewPosts}개\n• 추출 실패한 포스트: ${totalFailedPosts}개`;

    return `${header}${body}${summary}${failedPostsDetail}`;
};

export const sendSlackMessage = async (message: string): Promise<void> => {
    if (!SLACK_WEBHOOK_URL) {
        console.error('SLACK_WEBHOOK_URL이 설정되지 않았습니다.');
        return;
    }

    try {
        await axios.post(SLACK_WEBHOOK_URL, { text: message });
        console.log('Slack 메시지 전송 성공');
    } catch (error) {
        console.error('Slack 메시지 전송 실패:', error);
        throw error;
    }
}; 