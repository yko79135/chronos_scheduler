export const DAYS = ['월', '화', '수', '목', '금'];
export function defaultTimeSlots() { const base = [['0', '08:30', '09:00', 'arrival'], ['1', '09:00', '09:40', 'class'], ['2', '09:45', '10:25', 'class'], ['3', '10:30', '11:10', 'class'], ['4', '11:15', '11:55', 'class'], ['L', '11:55', '13:05', 'lunch'], ['5', '13:05', '13:45', 'class'], ['6', '13:50', '14:30', 'class'], ['7', '14:35', '15:15', 'class'], ['8', '15:20', '16:00', 'after-school']]; return DAYS.flatMap(day => base.map(b => ({ day, period: b[0] === 'L' ? 99 : Number(b[0]), startTime: b[1], endTime: b[2], type: b[3] }))); }
export function regularSlotKeys(after = false) { return DAYS.flatMap(d => (after ? [8] : [1, 2, 3, 4, 5, 6, 7]).map(p => `${d}-${p}`)); }
export function slotDay(s) { return s.split('-')[0]; }
export function slotPeriod(s) { return Number(s.split('-')[1]); }
export function slotRange(start, length) { const d = slotDay(start), p = slotPeriod(start); return Array.from({ length }, (_, i) => `${d}-${p + i}`); }
export function crossesLunch(start, length) { const p = slotPeriod(start); return p < 5 && p + length - 1 >= 5; }
