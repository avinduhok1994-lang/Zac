import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const generateId = () => Math.random().toString(36).substring(2, 15);

export const AVATARS = [
  "https://picsum.photos/seed/user1/200",
  "https://picsum.photos/seed/user2/200",
  "https://picsum.photos/seed/user3/200",
  "https://picsum.photos/seed/user4/200",
  "https://picsum.photos/seed/user5/200",
  "https://picsum.photos/seed/user6/200",
];
