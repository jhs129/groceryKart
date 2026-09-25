export {};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      activeOrganizationId: string | null;
      role: "owner" | "member" | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    activeOrganizationId?: string | null;
    role?: "owner" | "member" | null;
  }
}
