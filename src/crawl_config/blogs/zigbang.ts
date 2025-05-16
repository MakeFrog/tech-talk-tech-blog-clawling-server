import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const zigbangConfig: BlogConfig = {
    id: 'zigbang',
    name: '직방 테크블로그',
    feedUrl: 'https://medium.com/feed/zigbang',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default zigbangConfig; 