// src/@types/user.ts
export interface User {
    id: number;
    name: string;
    email: string;
    username: string;
    password: string;
    picture?: string; // Propriedade picture opcional
    createdAt: Date;
    updatedAt: Date;
  }
  