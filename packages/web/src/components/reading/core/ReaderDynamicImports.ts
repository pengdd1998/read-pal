import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

/**
 * Lazy-loaded reading page components.
 *
 * Extracted from the read page to keep the page component under 300 lines.
 * All are client-only (no SSR) because they depend on browser APIs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dyn = ComponentType<any>;

export const ReaderView: Dyn = dynamic(() => import('@/components/reading/core/ReaderView').then((m) => ({ default: m.ReaderView })), { ssr: false });
export const CompanionChatDynamic: Dyn = dynamic(() => import('@/components/reading/chat/CompanionChat').then((m) => ({ default: m.CompanionChat })), { ssr: false });
export const SelectionToolbar: Dyn = dynamic(() => import('@/components/reading/annotations/SelectionToolbar').then((m) => ({ default: m.SelectionToolbar })), { ssr: false });
export const AnnotationsSidebar: Dyn = dynamic(() => import('@/components/reading/annotations/AnnotationsSidebar').then((m) => ({ default: m.AnnotationsSidebar })), { ssr: false });
export const ReadingBackground: Dyn = dynamic(() => import('@/components/reading/core/ReadingBackground').then((m) => ({ default: m.ReadingBackground })), { ssr: false });
export const InterventionToast: Dyn = dynamic(() => import('@/components/reading/chat/InterventionToast').then((m) => ({ default: m.InterventionToast })), { ssr: false });
export const SessionSummaryModal: Dyn = dynamic(() => import('@/components/reading/panels/SessionSummaryModal').then((m) => ({ default: m.SessionSummaryModal })), { ssr: false });
export const BookCompletionModal: Dyn = dynamic(() => import('@/components/reading/panels/BookCompletionModal').then((m) => ({ default: m.BookCompletionModal })), { ssr: false });
export const MobileSettingsSheet: Dyn = dynamic(() => import('@/components/reading/core/MobileSettingsSheet').then((m) => ({ default: m.MobileSettingsSheet })), { ssr: false });
export const SearchOverlay: Dyn = dynamic(() => import('@/components/reading/core/SearchOverlay').then((m) => ({ default: m.SearchOverlay })), { ssr: false });
export const SynthesisPanel: Dyn = dynamic(() => import('@/components/reading/panels/SynthesisPanel').then((m) => ({ default: m.SynthesisPanel })), { ssr: false });
export const ReadingPlanPanel: Dyn = dynamic(() => import('@/components/reading/panels/ReadingPlanPanel').then((m) => ({ default: m.ReadingPlanPanel })), { ssr: false });
export const StudyModePanel: Dyn = dynamic(() => import('@/components/reading/panels/StudyModePanel').then((m) => ({ default: m.StudyModePanel })), { ssr: false });
export const FictionPanel: Dyn = dynamic(() => import('@/components/reading/panels/FictionPanel').then((m) => ({ default: m.FictionPanel })), { ssr: false });
export const ChapterTimeline: Dyn = dynamic(() => import('@/components/reading/core/ChapterTimeline').then((m) => ({ default: m.ChapterTimeline })), { ssr: false });
export const ShortcutsHelp: Dyn = dynamic(() => import('@/components/reading/core/ShortcutsHelp').then((m) => ({ default: m.ShortcutsHelp })), { ssr: false });
export const FeatureTour: Dyn = dynamic(() => import('@/components/reading/core/FeatureTour').then((m) => ({ default: m.FeatureTour })), { ssr: false });
