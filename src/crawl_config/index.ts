import { BlogConfig } from '../types';
import jobkorea from './blogs/jobkorea';
import coupang from './blogs/coupang';
import naverD2 from './blogs/naver_d2';

interface BlogConfigs {
    [key: string]: BlogConfig;
}

export const blogConfigs: BlogConfigs = {
    jobkorea,
    coupang,
    naverD2
}; 