import { useState, useEffect } from 'react';

export function useAdmin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async (): Promise<void> => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include' // Include session cookies
      });
      const data = await response.json();
      const authenticated = data.authenticated === true;
      
      setIsAuthenticated(authenticated);
      
      // Sync with localStorage for quick client-side checks
      if (authenticated) {
        localStorage.setItem('admin-authenticated', 'true');
      } else {
        localStorage.removeItem('admin-authenticated');
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
      setIsAuthenticated(false);
      localStorage.removeItem('admin-authenticated');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Include session cookies
        body: JSON.stringify({ password })
      });
      
      const data = await response.json();
      
      if (response.ok && data.authenticated) {
        setIsAuthenticated(true);
        localStorage.setItem('admin-authenticated', 'true');
        return true;
      } else {
        setIsAuthenticated(false);
        localStorage.removeItem('admin-authenticated');
        return false;
      }
    } catch (error) {
      console.error('Login failed:', error);
      setIsAuthenticated(false);
      localStorage.removeItem('admin-authenticated');
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include' // Include session cookies
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      // Always clear local state regardless of server response
      setIsAuthenticated(false);
      localStorage.removeItem('admin-authenticated');
    }
  };

  return {
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkAuthStatus
  };
}
