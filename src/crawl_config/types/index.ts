import { CheerioAPI } from 'cheerio';
import { Item } from 'rss-parser';

export interface RSSItem extends Item {
    content?: string;
    contentEncoded?: string;
    description?: string;
    subtitle?: string;
    pubDate?: string;
    isoDate?: string;
}

export interface ContentResult {
    description: string;
    content: string;
}

export interface BlogConfig {
    id: string;
    name: string;
    feedUrl: string;
    authorSelector?: string;
    platform: string;
    extractContent: ($: CheerioAPI, url: string, item: RSSItem) => Promise<ContentResult>;
    extractThumbnail: ($: CheerioAPI, url: string, item: RSSItem) => Promise<string>;
} 