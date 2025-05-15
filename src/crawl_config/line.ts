import { BlogConfig, RSSItem } from '../types';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const lineBlogConfig: BlogConfig = {
    id: 'line',
    name: 'LINE 기술 블로그',
    feedUrl: 'https://engineering.linecorp.com/ko/feed',
    platform: 'LINE',
    authorSelector: '.blog-author',  // 작성자 정보를 가져올 CSS 선택자

    // 컨텐츠 추출 함수
    async extractContent($: CheerioAPI, url: string, item: RSSItem): Promise<{ content: string; description: string }> {
        // RSS 피드에서 제공하는 컨텐츠가 있는지 확인
        if (item.content || item.contentEncoded) {
            return {
                content: item.contentEncoded || item.content || '',
                description: item.description || item.subtitle || ''
            };
        }

        // RSS에서 제공하지 않는 경우 직접 크롤링
        try {
            const response = await axios.get(url);
            const $detail = cheerio.load(response.data);

            // 본문 내용 (.article-content가 본문 영역이라고 가정)
            const content = $detail('.article-content').html() || '';

            // 설명 (meta description 또는 첫 번째 문단)
            let description = $detail('meta[name="description"]').attr('content') || '';
            if (!description) {
                description = $detail('.article-content p').first().text().trim();
            }

            return { content, description };
        } catch (error) {
            console.error(`Failed to crawl LINE blog content: ${error}`);
            return {
                content: item.content || '',
                description: item.description || ''
            };
        }
    },

    // 썸네일 이미지 추출 함수
    async extractThumbnail($: CheerioAPI, url: string, item: RSSItem): Promise<string> {
        // RSS 피드에서 이미지를 찾아보기
        const content = item.content || item.contentEncoded || '';
        const $content = cheerio.load(content);
        let thumbnail = $content('img').first().attr('src') || '';

        // RSS에서 이미지를 찾지 못한 경우 직접 크롤링
        if (!thumbnail) {
            try {
                const response = await axios.get(url);
                const $detail = cheerio.load(response.data);

                // 대표 이미지 찾기 (og:image 또는 첫 번째 이미지)
                thumbnail = $detail('meta[property="og:image"]').attr('content') ||
                    $detail('.article-content img').first().attr('src') || '';
            } catch (error) {
                console.error(`Failed to crawl LINE blog thumbnail: ${error}`);
            }
        }

        return thumbnail;
    }
}; 