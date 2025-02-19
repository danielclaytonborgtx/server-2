// src/@types/property.ts
export interface Property {
    id: number;
    title: string;
    description: string;
    price: number;
    latitude: number;
    longitude: number;
    category: string;
    userId: number;
    createdAt: Date;
    updatedAt: Date;
    images: string[]; 
  }
  
  