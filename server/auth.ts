import { Request, Response, NextFunction } from 'express';

// Extend the session interface to include admin authentication
declare module 'express-session' {
  interface SessionData {
    isAdminAuthenticated?: boolean;
  }
}

// Authentication middleware for admin routes
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAdminAuthenticated === true) {
    next();
  } else {
    res.status(401).json({ 
      message: 'Unauthorized: Admin authentication required',
      authenticated: false 
    });
  }
}

// Admin login function
export function loginAdmin(password: string): boolean {
  // Using the same password as the client-side for consistency
  return password === 'artist123';
}

// Helper function to authenticate admin session
export function authenticateAdminSession(req: Request, password: string): boolean {
  if (loginAdmin(password)) {
    req.session.isAdminAuthenticated = true;
    return true;
  }
  return false;
}

// Helper function to logout admin
export function logoutAdminSession(req: Request): void {
  req.session.isAdminAuthenticated = false;
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
  });
}