import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const styleshareConfig: BlogConfig = {
    id: 'styleshare',
    name: '스타일쉐어',
    feedUrl: 'https://medium.com/feed/styleshare',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default styleshareConfig; 