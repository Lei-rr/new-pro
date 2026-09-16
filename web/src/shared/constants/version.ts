import versionText from '../../../../VERSION?raw'

/**
 * 全局统一应用版本号（单一真实信息源，直接从根目录 VERSION 文件读取）
 */
export const APP_VERSION = versionText.trim() || '1.1.1'
