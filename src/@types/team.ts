export interface Team {
    id: number;
    name: string;
    creatorId: number;
    createdAt: Date;
    updatedAt: Date;
    imageUrl?: string; 
    members: Member[];
  }
  
  export interface Member {
    id: number;
    userId: number;
    role?: string; 
    joinedAt: Date; 
  }
  