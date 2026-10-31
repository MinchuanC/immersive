import { mineradioConsoleLabels } from './consoleLabels';

// Copy sent to the isolated donor console only when the host language changes.
export interface StageConsoleCopy {
    stageTitle: string;
    closeConsole: string;
    lyrics: string;
    hostSettings: string;
    hostManaged: string;
    unavailable: string;
    windowsMemory: string;
    unavailableSummary: string;
    noResults: string;
    parameterCount: string;
    strings: Record<string, string>;
}

const strings = (column: 0 | 1 | 2) => Object.fromEntries(mineradioConsoleLabels.map(row => [row[0], row[column]]));
const copies: Record<string, StageConsoleCopy> = {
    en: { stageTitle: 'MineRadio visual stage', closeConsole: 'Close visual console', lyrics: 'Lyrics renderer', hostSettings: 'Open player settings', hostManaged: 'Configure this option in the player settings.', unavailable: 'This feature is unavailable in this player.', windowsMemory: 'This Windows memory tool is unavailable in this player.', unavailableSummary: 'Desktop overlays, camera gestures and Windows memory tools are unavailable in this player.', noResults: 'No results for “{query}”', parameterCount: '{count} parameters', strings: strings(1) },
    'zh-CN': { stageTitle: 'MineRadio 视觉舞台', closeConsole: '关闭视觉控制台', lyrics: '歌词渲染器', hostSettings: '打开播放器设置', hostManaged: '请在播放器设置中调整此选项。', unavailable: '此播放器暂不支持此功能。', windowsMemory: '此播放器不支持此 Windows 内存工具。', unavailableSummary: '此播放器暂不支持桌面叠加层、摄像头手势和 Windows 内存工具。', noResults: '没有找到“{query}”', parameterCount: '{count} 项参数', strings: strings(0) },
    id: { stageTitle: 'Panggung visual MineRadio', closeConsole: 'Tutup konsol visual', lyrics: 'Perender lirik', hostSettings: 'Buka pengaturan pemutar', hostManaged: 'Atur opsi ini di pengaturan pemutar.', unavailable: 'Fitur ini tidak tersedia di pemutar ini.', windowsMemory: 'Alat memori Windows ini tidak tersedia di pemutar ini.', unavailableSummary: 'Lapisan desktop, gestur kamera, dan alat memori Windows tidak tersedia di pemutar ini.', noResults: 'Tidak ada hasil untuk “{query}”', parameterCount: '{count} parameter', strings: strings(2) },
};

export const mineradioConsoleEn = copies.en;
export const mineradioConsoleZhCN = copies['zh-CN'];
export const mineradioConsoleId = copies.id;
