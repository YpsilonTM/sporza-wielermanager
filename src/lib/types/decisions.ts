export interface ManagerDecisionView {
	id: number;
	matchId: number | null;
	matchName: string | null;
	decisionType: string;
	summary: string;
	confidence: number | null;
	reasoning: string;
	submitted: boolean;
	submittedAt: string;
}
