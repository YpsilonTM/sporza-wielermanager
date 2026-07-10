export interface ManagerDecisionView {
	id: number;
	matchId: number | null;
	matchName: string | null;
	decisionType: string;
	summary: string;
	confidence: number | null;
	reasoning: string;
	preview: import('./preview').ManagePreviewView | import('./preview').RosterPreviewView | null;
	submitted: boolean;
	submittedAt: string;
}
