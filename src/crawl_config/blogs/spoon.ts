import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const spoonConfig: BlogConfig = {
    id: 'spoon',
    name: '스푼라디오 테크블로그',
    feedUrl: 'https://medium.com/feed/spoontech',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default spoonConfig; 