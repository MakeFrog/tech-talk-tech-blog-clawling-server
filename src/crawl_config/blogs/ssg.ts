import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const ssgConfig: BlogConfig = {
    id: 'ssg',
    name: 'SSG 테크블로그',
    feedUrl: 'https://medium.com/feed/ssgtech',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default ssgConfig; 