import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const lemonbaseConfig: BlogConfig = {
    id: 'lemonbase',
    name: '레몬베이스 테크블로그',
    feedUrl: 'https://medium.com/feed/lemonbase',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default lemonbaseConfig; 