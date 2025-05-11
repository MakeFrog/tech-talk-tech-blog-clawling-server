import * as cheerio from 'cheerio';
import { CheerioAPI } from 'cheerio';
import { axiosInstance } from '../../utils/http';
import { RSSItem, ContentResult } from '../../types';

interface MediumPlatform {
    extractContent: ($: CheerioAPI, url: string, item: RSSItem) => Promise<ContentResult>;
    extractThumbnail: ($: CheerioAPI, url: string, item: RSSItem) => Promise<string>;
}

export const mediumPlatform: MediumPlatform = {
    async extractContent($: CheerioAPI, url: string, item: RSSItem): Promise<ContentResult> {
        try {
            let content = '';
            let description = '';

            if (item.content) {
                content = item.content;
                description = item.contentEncoded || item.contentSnippet || '';
            } else {
                const response = await axiosInstance.get(url);
                const $page = cheerio.load(response.data);
                content = $page('article').html() || '';
                description = $page('meta[name="description"]').attr('content') || '';
            }

            return {
                content,
                description: description.slice(0, 200) // 설명은 200자로 제한
            };
        } catch (error) {
            console.error(`Medium content extraction failed for ${url}:`, error);
            return {
                content: '',
                description: ''
            };
        }
    },

    async extractThumbnail($: CheerioAPI, url: string, item: RSSItem): Promise<string> {
        try {
            // 1. RSS 피드의 content에서 이미지 찾기
            if (item.content) {
                const $content = cheerio.load(item.content);

                // figure 태그 내의 이미지 찾기
                const figureImg = $content('figure img').first().attr('src');
                if (figureImg) return figureImg;

                // 일반 이미지 태그 찾기
                const regularImg = $content('img').first().attr('src');
                if (regularImg) return regularImg;
            }

            // 2. 실제 페이지에서 이미지 찾기
            const response = await axiosInstance.get(url);
            const $page = cheerio.load(response.data);

            // Medium의 메인 이미지 찾기
            const mainImage = $page('figure img').first().attr('src') ||
                $page('img[data-testid="og"]').attr('src') ||
                $page('meta[property="og:image"]').attr('content') ||
                $page('meta[name="twitter:image:src"]').attr('content');

            return mainImage || '';
        } catch (error) {
            console.error(`Medium thumbnail extraction failed for ${url}:`, error);
            return '';
        }
    }
}; 