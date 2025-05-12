import { axiosInstance } from './http';
import probe from 'probe-image-size';

// 이미지 URL이 유효한지 확인
export async function isValidImageUrl(url: string): Promise<boolean> {
    try {
        const response = await axiosInstance.head(url);
        const contentType = response.headers['content-type'];
        return contentType?.startsWith('image/') || false;
    } catch (error) {
        return false;
    }
}

// 이미지 크기 정보 가져오기
export async function getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
    try {
        const result = await probe(url);
        return {
            width: result.width,
            height: result.height
        };
    } catch (error) {
        return null;
    }
}

// 이미지 형식이 유효한지 확인
export async function isValidImageFormat(url: string): Promise<boolean> {
    try {
        const response = await axiosInstance.head(url);
        const contentType = response.headers['content-type'];

        // 허용할 이미지 형식 목록
        const validFormats = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp'
        ];

        return validFormats.includes(contentType || '') || false;
    } catch (error) {
        return false;
    }
} 