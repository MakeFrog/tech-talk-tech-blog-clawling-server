import { BlogConfig, RSSItem, ContentResult } from '../../types';
import { CheerioAPI } from 'cheerio';
import { axiosInstance } from '../../utils/http';
import * as cheerio from 'cheerio';

const lineConfig: BlogConfig = {
    id: 'line',
    name: 'LINE 기술 블로그',
    feedUrl: 'https://techblog.lycorp.co.jp/ko/feed/index.xml',
    platform: 'line',
    authorSelector: '',

    // 컨텐츠 추출 함수
    async extractContent($: CheerioAPI, url: string, item: RSSItem): Promise<ContentResult> {
        let description = '';
        let content = '';

        try {
            // RSS 피드에서 제공하는 컨텐츠가 있는지 확인
            if (item.contentEncoded) {
                content = item.contentEncoded;
                description = item.description || '';

                // HTML 태그 제거하고 설명 추출
                if (!description) {
                    const $content = cheerio.load(content);
                    const firstParagraph = $content('p').filter((i, el) => {
                        const text = $content(el).text().trim();
                        return text.length > 50;
                    }).first().text().trim();
                    description = firstParagraph;
                }
            }

            // RSS에서 컨텐츠를 가져오지 못한 경우 직접 크롤링
            if (!content) {
                const response = await axiosInstance.get(url);
                const $detail = cheerio.load(response.data);

                // 본문 내용 추출
                content = $detail('.content_inner > .content').html() || '';

                // 설명 추출 (첫 번째 의미 있는 단락)
                if (!description) {
                    const paragraphs = $detail('.content_inner > .content p');
                    description = paragraphs.filter((i, el) => {
                        const text = $detail(el).text().trim();
                        return text.length > 50;
                    }).first().text().trim();
                }
            }

            return {
                content: content || '',
                description: description || '설명이 제공되지 않습니다.'
            };
        } catch (error) {
            console.error('컨텐츠 추출 중 오류 발생:', error);
            return {
                content: '',
                description: '컨텐츠를 가져오는 중 오류가 발생했습니다.'
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
                const response = await axiosInstance.get(url);
                const $detail = cheerio.load(response.data);

                // 대표 이미지 찾기 (og:image 또는 첫 번째 이미지)
                thumbnail = $detail('meta[property="og:image"]').attr('content') ||
                    $detail('.content_inner > .content img').first().attr('src') || '';
            } catch (error) {
                console.error(`Failed to crawl LINE blog thumbnail: ${error}`);
            }
        }

        return thumbnail;
    }
};

export default lineConfig; 