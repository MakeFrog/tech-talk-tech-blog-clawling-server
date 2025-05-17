import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const naverPlaceConfig: BlogConfig = {
    id: 'naver-place',
    name: '네이버 플레이스',
    feedUrl: 'https://medium.com/feed/naver-place-dev',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default naverPlaceConfig; 