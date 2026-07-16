export interface PostMortemView {
	matchId: number;
	matchName: string | null;
	matchScore: number;
	recentAverage: number | null;
	captainName: string | null;
	captainId: number | null;
	confidence: number | null;
	source: string | null;
	summary: string;
	updatedAt: string;
}

export interface ManagerDecisionView {
	id: number;
	matchId: number | null;
	matchName: string | null;
	decisionType: string;
	summary: string;
	confidence: number | null;
	reasoning: string;
	preview: import('./preview').ManagePreviewView | import('./preview').RosterPreviewView | null;
	matchScore: number | null;
	postMortem: PostMortemView | null;
	decisionSource: string | null;
	submitted: boolean;
	submittedAt: string;
}
