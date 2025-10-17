'use client';

import React, { useEffect, useState } from 'react';
import type { AuthState } from '../../AuthResult';
import Image from 'next/image';

// --- Simulated API helpers ---
async function apiValidateSession(token: string | null): Promise<boolean> {
  return Boolean(token);
}
async function apiLogout(_token: string | null): Promise<void> {
  return;
}

export type PageKey =
  | 'Upload Data'
  | 'Scheduling Rules'
  | 'Irregular Events'
  | 'Generate Schedule'
  | 'View Schedule'
  | 'Export'
  | 'Saved Schedules';

const NAV_ITEMS: { key: PageKey; label: string; icon: string }[] = [
  { key: 'Upload Data', label: 'Upload Data', icon: '📁' },
  { key: 'Scheduling Rules', label: 'Scheduling Rules', icon: '📏' },
  { key: 'Irregular Events', label: 'Irregular Events', icon: '🎯' },
  { key: 'Generate Schedule', label: 'Generate Schedule', icon: '⚙️' },
  { key: 'View Schedule', label: 'View Schedule', icon: '📋' },
  { key: 'Export', label: 'Export', icon: '📤' },
  { key: 'Saved Schedules', label: 'Saved Schedules', icon: '💾' },
];

export default function Sidebar({
  currentPage,
  onNavigate,
}: {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
}) {
  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    userId: null,
    username: null,
    authToken: null,
  });
  const [validating, setValidating] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Load auth from localStorage and validate
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const username = localStorage.getItem('username');
    const userIdStr = localStorage.getItem('userId');

    (async () => {
      const ok = await apiValidateSession(token);
      if (ok && token && username && userIdStr) {
        setAuth({
          authenticated: true,
          username,
          userId: Number(userIdStr),
          authToken: token,
        });
      }
      setValidating(false);
    })();
  }, []);

  const logout = async () => {
    await apiLogout(auth.authToken);
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    setAuth({
      authenticated: false,
      userId: null,
      username: null,
      authToken: null,
    });
    window.location.reload(); // ✅ force the whole app to re-evaluate auth
  };

  return (
    <nav className="bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-700">
      <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <a href="#" className="flex items-center space-x-3 rtl:space-x-reverse">
          <img
            src="https://flowbite.com/docs/images/logo.svg"
            className="h-8"
            alt="Flowbite Logo"
          />
          <span className="self-center text-2xl font-semibold whitespace-nowrap dark:text-white">
            Auto Scheduler
          </span>
        </a>
        {/* ---- Username ---- */}
        {/* <span className="block py-2 px-3 text-gray-900 rounded-sm hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent">
          👤 {auth.username}
        </span> */}

        <div className="items-center justify-between hidden w-full md:flex md:w-auto md:order-1">
          <ul className="menu menu-horizontal flex flex-col font-medium p-4 md:p-0 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:space-x-8 rtl:space-x-reverse md:flex-row md:mt-0 md:border-0 md:bg-white dark:bg-gray-800 md:dark:bg-gray-900 dark:border-gray-700">
            <li>
              <a
                href="#"
                className="block py-2 px-3 text-gray-900 rounded-sm hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent"
                aria-current="page"
              >
                Home
              </a>
            </li>
            <li>
              <details>
                <summary className="text-gray-900 rounded-sm md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 md:w-auto dark:text-white md:dark:hover:text-blue-500 dark:focus:text-white dark:border-gray-700 dark:hover:bg-gray-700 md:dark:hover:bg-transparent">
                  Services
                </summary>
                {/* <!-- Dropdown menu --> */}
                <ul
                  id="dropdownNavbar"
                  className="py-2 text-sm text-gray-700 dark:text-gray-400 font-normal bg-white divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700 dark:divide-gray-600"
                >
                  <li>
                    <a
                      href="#"
                      className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
                    >
                      Upload Data
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
                    >
                      Scheduling Rules
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
                    >
                      Irregular Events
                    </a>
                  </li>
                </ul>
              </details>
            </li>
            <li>
              <a
                href="#"
                className="block py-2 px-3 text-gray-900 rounded-sm hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent"
              >
                Generate Schedule
              </a>
            </li>
            <li>
              <a
                href="#"
                className="block py-2 px-3 text-gray-900 rounded-sm hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent"
              >
                Saved Schedules
              </a>
            </li>
            <li>
              <a
                href="#"
                className="block py-2 px-3 text-gray-900 rounded-sm hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent"
              >
                Export
              </a>
            </li>
            {/* Logout */}
            {!validating && auth.authenticated && (
              <div className="">
                <button
                  onClick={logout}
                  title="Logout"
                  className="block py-2 px-3 text-gray-900 rounded-sm hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent"
                >
                  <span className="ml-1">Logout</span>
                </button>
              </div>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
