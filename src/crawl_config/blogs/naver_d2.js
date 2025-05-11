const cheerio = require('cheerio');
const { axiosInstance } = require('../../utils/http');

const naverD2Config = {
    id: 'naver_d2',
    name: 'NAVER D2',
    feedUrl: 'https://d2.naver.com/d2.atom',
    authorSelector: '.content__author',
    platform: 'naver_d2',

    async extractContent($, url, item) {
        let description = '';
        let content = '';

        try {
            if (item.content) {
                content = item.content;
                const $content = cheerio.load(content);

                // FE News 글인 경우 특별 처리
                if (url.includes('/news/') || item.title.includes('FE News')) {
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

            if (!description || description.length < 50) {
                const response = await axiosInstance.get(url);
                const $page = cheerio.load(response.data);

                description = $page('meta[property="og:description"]').attr('content') ||
                    $page('meta[name="description"]').attr('content');

                if (!description || description.length < 50) {
                    const contentForDesc = $page('.content__body p').filter((i, el) => {
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

            return {
                description: description || '내용 없음',
                content: content || ''
            };
        } catch (error) {
            console.error(`네이버 D2 content extraction failed for ${url}:`, error);
            return {
                description: description || '내용 없음',
                content: content || ''
            };
        }
    },

    async extractThumbnail($, url, item) {
        try {
            if (item.content) {
                const $content = cheerio.load(item.content);
                const firstImage = $content('img').first();
                let imageUrl = firstImage.attr('src');

                if (imageUrl && imageUrl.startsWith('/')) {
                    imageUrl = `https://d2.naver.com${imageUrl}`;
                }

                if (imageUrl) {
                    return imageUrl;
                }
            }

            const response = await axiosInstance.get(url);
            const $page = cheerio.load(response.data);

            const ogImage = $page('meta[property="og:image"]').attr('content');
            const firstContentImage = $page('.content__body img').first().attr('src');

            let imageUrl = ogImage || firstContentImage;

            if (imageUrl && imageUrl.startsWith('/')) {
                imageUrl = `https://d2.naver.com${imageUrl}`;
            }

            return imageUrl || '';
        } catch (error) {
            console.error(`네이버 D2 thumbnail extraction failed for ${url}:`, error);
            return '';
        }
    }
};

module.exports = naverD2Config; 