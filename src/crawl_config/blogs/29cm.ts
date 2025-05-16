import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const twentyNineCmConfig: BlogConfig = {
    id: '29cm',
    name: '29CM 테크블로그',
    feedUrl: 'https://medium.com/feed/29cm',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default twentyNineCmConfig; 