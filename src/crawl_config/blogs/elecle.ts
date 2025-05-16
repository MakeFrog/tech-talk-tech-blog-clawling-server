import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const elecleConfig: BlogConfig = {
    id: 'elecle',
    name: '일레클 테크블로그',
    feedUrl: 'https://medium.com/feed/elecle-bike',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default elecleConfig; 