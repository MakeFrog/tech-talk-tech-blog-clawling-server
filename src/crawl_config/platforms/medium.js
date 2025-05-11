const cheerio = require('cheerio');
const axios = require('axios');
const { writeLog } = require('../../utils/logger');

// Medium 플랫폼 공통 설정
const mediumPlatform = {
    extractContent: async ($, link, item) => {
        try {
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
                description
            };
        } catch (error) {
            writeLog(`컨텐츠 추출 실패: ${error.message}`);
            return {
                content: '',
                description: ''
            };
        }
    },

    extractThumbnail: async ($, link, item) => {
        try {
            // 1. content에서 이미지 찾기
            if (item.content) {
                const $content = cheerio.load(item.content);
                const firstImage = $content('img').first();
                if (firstImage.length) {
                    const src = firstImage.attr('src');
                    if (src && src.startsWith('http')) {
                        return src;
                    }
                }
            }

            // 2. contentEncoded에서 이미지 찾기
            if (item.contentEncoded) {
                const $encoded = cheerio.load(item.contentEncoded);
                const firstEncodedImage = $encoded('img').first();
                if (firstEncodedImage.length) {
                    const src = firstEncodedImage.attr('src');
                    if (src && src.startsWith('http')) {
                        return src;
                    }
                }
            }

            return null;
        } catch (error) {
            writeLog(`썸네일 추출 실패: ${error.message}`);
            return null;
        }
    }
};

module.exports = mediumPlatform; 