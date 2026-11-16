// Illustrations for the Lost Skills manual: one hero image per skill plus visual guides.
const imgs = import.meta.glob('../assets/manual/*.webp', { eager: true, query: '?url', import: 'default' });
export const MANUAL_IMG = Object.fromEntries(Object.entries(imgs).map(([path, url]) => [path.split('/').pop().replace('.webp', ''), url]));
export const EMERGENCY_NUMBER = '999';
