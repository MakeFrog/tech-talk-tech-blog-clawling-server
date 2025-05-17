import * as cheerio from 'cheerio';
import { CheerioAPI } from 'cheerio';
import { axiosInstance } from '../../utils/http';
import { BlogConfig, RSSItem, ContentResult } from '../../types';
import { isValidImageUrl, getImageDimensions, isValidImageFormat } from '../../utils/image';

const woowahanConfig: BlogConfig = {
    id: 'woowahan',
    name: '우아한형제들',
    feedUrl: 'https://techblog.woowahan.com/feed/',
    platform: 'woowahan',

    async extractContent($: CheerioAPI, url: string, item: RSSItem): Promise<ContentResult> {
        let description = '';
        let content = '';

        try {
            // content:encoded에서 전체 본문 추출
            if (item.contentEncoded) {
                content = item.contentEncoded;
                const $content = cheerio.load(content);

                // 첫 번째 유효한 텍스트 단락을 description으로 사용
                const firstParagraph = $content('p').filter((i, el) => {
                    const text = $content(el).text().trim();
                    return text.length > 50;
                }).first().text();

                if (firstParagraph) {
                    description = firstParagraph.substring(0, 200).trim() + '...';
                }
            }

            // content:encoded가 없거나 description이 추출되지 않은 경우
            if (!content || !description) {
                const response = await axiosInstance.get(url);
                const $page = cheerio.load(response.data);

                if (!content) {
                    content = $page('.entry-content').html() || '';
                }

                if (!description) {
                    description = $page('meta[property="og:description"]').attr('content') ||
                        $page('meta[name="description"]').attr('content') || '';

                    if (!description) {
                        const contentForDesc = $page('.entry-content p').filter((i, el) => {
                            const text = $page(el).text().trim();
                            return text.length > 50;
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
            console.error(`우아한형제들 content extraction failed for ${url}:`, error);
            return {
                description: description || '내용 없음',
                content: content || ''
            };
        }
    },

    async extractThumbnail($: CheerioAPI, url: string, item: RSSItem): Promise<string> {
        try {
            // 1. 대표 이미지 확인 (og:image)
            let featuredImage = $('meta[property="og:image"]').attr('content');
            if (featuredImage && !featuredImage.includes('우아한테크-로고')) {
                // 내부 도메인을 공개 도메인으로 변경
                featuredImage = featuredImage.replace('techblog.woowa.in', 'techblog.woowahan.com');
                return featuredImage;
            }

            // 2. content:encoded에서 첫 번째 유효한 이미지 추출
            if (item.contentEncoded) {
                const $content = cheerio.load(item.contentEncoded);
                const images = $content('img').toArray();

                for (const img of images) {
                    let src = $content(img).attr('src');
                    const alt = $content(img).attr('alt');
                    const className = $content(img).attr('class');

                    // 이모지, 작은 아이콘 제외
                    if (!src ||
                        src.includes('wp-smiley') ||
                        className?.includes('wp-smiley') ||
                        (alt && alt.match(/[\u{1F300}-\u{1F9FF}]/u))) {
                        continue;
                    }

                    // 내부 도메인을 공개 도메인으로 변경
                    src = src.replace('techblog.woowa.in', 'techblog.woowahan.com');
                    return src;
                }
            }

            // 3. 기본 이미지 반환
            return 'https://techblog.woowahan.com/wp-content/uploads/2021/05/default-thumbnail.jpg';

        } catch (error) {
            console.error(`우아한형제들 thumbnail extraction failed for ${url}:`, error);
            return '';
        }
    }
};

export default woowahanConfig; 