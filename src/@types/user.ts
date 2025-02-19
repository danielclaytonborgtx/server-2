// src/@types/user.ts
export interface User {
    id: number;
    name: string;
    email: string;
    username: string;
    password: string;
    picture?: string; 
    createdAt: Date;
    updatedAt: Date;
  }
  