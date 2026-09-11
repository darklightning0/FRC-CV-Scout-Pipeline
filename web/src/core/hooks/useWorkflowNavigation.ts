/**
 * useWorkflowNavigation - Configurable scouting workflow navigation
 * 
 * This hook provides navigation helpers based on the workflow configuration
 * in game-schema.ts. It determines which pages are enabled and provides
 * methods to navigate between them.
 */

import { useMemo, useCallback } from 'react';
import { workflowConfig, type WorkflowRoutePage } from '@/game-template/game-schema';

// Page route mappings (only includes routable pages, not visibility flags)
const PAGE_ROUTES: Record<WorkflowRoutePage | 'gameStart', string> = {
    gameStart: '/game-start',
    autoStart: '/auto-start',
    autoScoring: '/auto-scoring',
    teleopScoring: '/teleop-scoring',
    endgame: '/endgame',
};

// Ordered list of all possible pages
const ALL_PAGES: (WorkflowRoutePage | 'gameStart')[] = [
    'gameStart',
    'autoStart',
    'autoScoring',
    'teleopScoring',
    'endgame',
];

export interface WorkflowNavigation {
    /** Ordered list of enabled pages */
    enabledPages: (WorkflowRoutePage | 'gameStart')[];

    /** Get the next page in the workflow, or null if this is the last page */
    getNextPage: (currentPage: WorkflowRoutePage | 'gameStart') => (WorkflowRoutePage | 'gameStart') | null;

    /** Get the previous page in the workflow, or null if this is the first page */
    getPrevPage: (currentPage: WorkflowRoutePage | 'gameStart') => (WorkflowRoutePage | 'gameStart') | null;

    /** Check if the given page is the last page (should show submit button) */
    isLastPage: (currentPage: WorkflowRoutePage | 'gameStart') => boolean;

    /** Check if the given page is the first page */
    isFirstPage: (currentPage: WorkflowRoutePage | 'gameStart') => boolean;

    /** Get the route path for a page */
    getRoute: (page: WorkflowRoutePage | 'gameStart') => string;

    /** Get the route for the next page */
    getNextRoute: (currentPage: WorkflowRoutePage | 'gameStart') => string | null;

    /** Get the route for the previous page */
    getPrevRoute: (currentPage: WorkflowRoutePage | 'gameStart') => string | null;

    /** Check if a specific page is enabled */
    isPageEnabled: (page: WorkflowRoutePage) => boolean;

    /** Whether the workflow config is valid (at least one scoring page enabled) */
    isConfigValid: boolean;
}

export function useWorkflowNavigation(): WorkflowNavigation {
    // Validate that at least one page is enabled
    const isConfigValid = Object.values(workflowConfig.pages).some(enabled => enabled);

    // Build ordered list of enabled pages
    const enabledPages = useMemo(() => {
        return ALL_PAGES.filter(page => {
            // gameStart is always enabled
            if (page === 'gameStart') return true;
            // Check workflow config for other pages
            return workflowConfig.pages[page] !== false;
        });
    }, []);

    const getNextPage = useCallback((currentPage: WorkflowRoutePage | 'gameStart'): (WorkflowRoutePage | 'gameStart') | null => {
        const currentIndex = enabledPages.indexOf(currentPage);
        if (currentIndex === -1 || currentIndex === enabledPages.length - 1) {
            return null;
        }
        return enabledPages[currentIndex + 1] ?? null;
    }, [enabledPages]);

    const getPrevPage = useCallback((currentPage: WorkflowRoutePage | 'gameStart'): (WorkflowRoutePage | 'gameStart') | null => {
        const currentIndex = enabledPages.indexOf(currentPage);
        if (currentIndex <= 0) {
            return null;
        }
        return enabledPages[currentIndex - 1] ?? null;
    }, [enabledPages]);

    const isLastPage = useCallback((currentPage: WorkflowRoutePage | 'gameStart') => {
        const currentIndex = enabledPages.indexOf(currentPage);
        return currentIndex === enabledPages.length - 1;
    }, [enabledPages]);

    const isFirstPage = useCallback((currentPage: WorkflowRoutePage | 'gameStart') => {
        const currentIndex = enabledPages.indexOf(currentPage);
        return currentIndex === 0;
    }, [enabledPages]);

    const getRoute = useCallback((page: WorkflowRoutePage | 'gameStart') => {
        return PAGE_ROUTES[page];
    }, []);

    const getNextRoute = useCallback((currentPage: WorkflowRoutePage | 'gameStart') => {
        const nextPage = getNextPage(currentPage);
        return nextPage ? PAGE_ROUTES[nextPage] : null;
    }, [getNextPage]);

    const getPrevRoute = useCallback((currentPage: WorkflowRoutePage | 'gameStart') => {
        const prevPage = getPrevPage(currentPage);
        return prevPage ? PAGE_ROUTES[prevPage] : null;
    }, [getPrevPage]);

    const isPageEnabled = useCallback((page: WorkflowRoutePage) => {
        return workflowConfig.pages[page] !== false;
    }, []);

    return {
        enabledPages,
        getNextPage,
        getPrevPage,
        isLastPage,
        isFirstPage,
        getRoute,
        getNextRoute,
        getPrevRoute,
        isPageEnabled,
        isConfigValid,
    };
}
