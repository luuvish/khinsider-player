/**
 * 파일 시스템 관련 상수
 */

/** 최소 오디오 파일 크기 (bytes) - 이보다 작으면 유효하지 않은 파일 */
export const MIN_AUDIO_FILE_SIZE = 1024;

/** 다운로드 완료 판정 임계값 (90%) */
export const DOWNLOAD_COMPLETION_THRESHOLD = 0.9;

/** 최대 파일명 길이 */
export const MAX_FILENAME_LENGTH = 200;

/** 최대 경로 길이 */
export const MAX_PATH_LENGTH = 4096;

/** 청크 크기 (다운로드) */
export const DOWNLOAD_CHUNK_SIZE = 64 * 1024;

/** 지원하는 오디오 확장자 */
export const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.wav', '.m4a'] as const;

/** 지원하는 이미지 확장자 */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'] as const;

/** 임시 파일 접두사 */
export const TEMP_FILE_PREFIX = 'khinsider-tmp-';

/** 임시 디렉토리 이름 */
export const TEMP_DIR_NAME = 'tmp';

/** 다운로드 디렉토리 이름 */
export const DOWNLOADS_DIR_NAME = 'downloads';

/** 트랙 디렉토리 이름 */
export const TRACKS_DIR_NAME = 'tracks';

/** 이미지 디렉토리 이름 */
export const IMAGES_DIR_NAME = 'images';

/** 메타데이터 파일 이름 */
export const METADATA_FILENAME = 'metadata.json';

/** 커버 이미지 파일 이름 */
export const COVER_FILENAME = 'cover.jpg';

/** 데이터베이스 파일 이름 */
export const DATABASE_FILENAME = 'khinsider.db';

/** 데이터 디렉토리 이름 */
export const DATA_DIR_NAME = 'data';
