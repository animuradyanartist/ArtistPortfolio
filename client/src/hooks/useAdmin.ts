import { useState, useEffect } from 'react';

export function useAdmin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const authenticated = localStorage.getItem('admin-authenticated') === 'true';
    setIsAuthenticated(authenticated);
  }, []);

  const login = (password: string): boolean => {
    if (password === 'artist123') {
      setIsAuthenticated(true);
      localStorage.setItem('admin-authenticated', 'true');
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('admin-authenticated');
  };

  return {
    isAuthenticated,
    login,
    logout
  };
}
