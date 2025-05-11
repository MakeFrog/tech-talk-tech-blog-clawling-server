import * as cheerio from 'cheerio';
import { CheerioAPI } from 'cheerio';
import { RSSItem, ContentResult } from '../types';

interface MediumPlatform {
    extractContent: ($: CheerioAPI, url: string, item: RSSItem) => Promise<ContentResult>;
    extractThumbnail: ($: CheerioAPI, url: string, item: RSSItem) => Promise<string>;
}

export const mediumPlatform: MediumPlatform = {
    extractContent: async ($: CheerioAPI, url: string, item: RSSItem): Promise<ContentResult> => {
        // Medium RSS는 content:encoded 또는 content 필드에 전체 본문이 포함됨
        const content = item.contentEncoded || item.content || '';

        // description은 RSS의 description 또는 subtitle 필드에서 직접 추출
        let description = item.description || item.subtitle || '';

        // description이 없거나 HTML 태그가 포함된 경우 첫 번째 문단에서 추출
        if (!description || description.includes('<')) {
            const $content = cheerio.load(content);
            description = $content('p').first().text() || '';
        }

        // description 길이 제한
        if (description.length > 200) {
            description = description.substring(0, 197) + '...';
        }

        return {
            content,
            description: description || '내용 없음'
        };
    },

    extractThumbnail: async ($: CheerioAPI, url: string, item: RSSItem): Promise<string> => {
        try {
            // Medium의 첫 번째 이미지를 썸네일로 사용
            const $content = cheerio.load(item.content || '');
            const firstImage = $content('img').first();
            return firstImage.attr('src') || '';
        } catch (error) {
            console.error(`Medium thumbnail extraction failed for ${url}:`, error);
            return '';
        }
    }
}; 