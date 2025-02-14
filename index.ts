import ScoreSaberAPI from "scoresaber.js";
import express from 'express';

async function getPPDifference(playerID1: string, playerID2 : string) {
    const player1PP =(await (ScoreSaberAPI.fetchBasicPlayer(playerID1))).pp
    const player2PP = (await (ScoreSaberAPI.fetchBasicPlayer(playerID2))).pp
    //console.log(player1PP)
    //console.log(player2PP)
    const difference = Math.floor((player2PP - player1PP)*100)/100
    return(difference)
}

async function diffToTopX(playerID : string,rank : number) {
    const no1K = (await ScoreSaberAPI.fetchPlayerByRank(rank)).id
    //console.log(no1K)
    return (getPPDifference(playerID,no1K))
}

export const WEIGHT_COEFFICIENT = 0.965;
export const PP_PER_STAR = 42.114296;

const ppCurve = [
	{at: 0.0, value: 0.0},
	{at: 60.0, value: 0.18223233667439062},
	{at: 65.0, value: 0.5866010012767576},
	{at: 70.0, value: 0.6125565959114954},
	{at: 75.0, value: 0.6451808210101443},
	{at: 80.0, value: 0.6872268862950283},
	{at: 82.5, value: 0.7150465663454271},
	{at: 85.0, value: 0.7462290664143185},
	{at: 87.5, value: 0.7816934560296046},
	{at: 90.0, value: 0.825756123560842},
	{at: 91.0, value: 0.8488375988124467},
	{at: 92.0, value: 0.8728710341448851},
	{at: 93.0, value: 0.9039994071865736},
	{at: 94.0, value: 0.9417362980580238},
	{at: 95.0, value: 1.0},
	{at: 95.5, value: 1.0388633331418984},
	{at: 96.0, value: 1.0871883573850478},
	{at: 96.5, value: 1.1552120359501035},
	{at: 97.0, value: 1.2485807759957321},
	{at: 97.25, value: 1.3090333065057616},
	{at: 97.5, value: 1.3807102743105126},
	{at: 97.75, value: 1.4664726399289512},
	{at: 98.0, value: 1.5702410055532239},
	{at: 98.25, value: 1.697536248647543},
	{at: 98.5, value: 1.8563887693647105},
	{at: 98.75, value: 2.058947159052738},
	{at: 99.0, value: 2.324506282149922},
	{at: 99.125, value: 2.4902905794106913},
	{at: 99.25, value: 2.685667856592722},
	{at: 99.375, value: 2.9190155639254955},
	{at: 99.5, value: 3.2022017597337955},
	{at: 99.625, value: 3.5526145337555373},
	{at: 99.75, value: 3.996793606763322},
	{at: 99.825, value: 4.325027383589547},
	{at: 99.9, value: 4.715470646416203},
	{at: 99.95, value: 5.019543595874787},
	{at: 100.0, value: 5.367394282890631},
];

export function ppFactorFromAcc(acc: number) {
	if (!acc || acc <= 0) {
		return 0;
	}
	let index = ppCurve.findIndex(o => o.at >= acc);
	if (index === -1) {
		return ppCurve[ppCurve.length - 1].value;
	}
	if (!index) {
		return ppCurve[0].value;
	}
	let from = ppCurve[index - 1];
	let to = ppCurve[index];
	let progress = (acc - from.at) / (to.at - from.at);
	return from.value + (to.value - from.value) * progress;
}

export function accFromPpFactor(ppFactor: number) {
	if (!ppFactor || ppFactor <= 0) return 0;

	const idx = ppCurve.findIndex(o => o.value >= ppFactor);
	if (idx < 0) return ppCurve[ppCurve.length - 1].at;

	const from = ppCurve[idx - 1];
	const to = ppCurve[idx];
	const progress = (ppFactor - from.value) / (to.value - from.value);

	return from.at + (to.at - from.at) * progress;
}

export const getTotalPpFromSortedPps = (ppArray: any[], startIdx = 0) =>
	ppArray.reduce((cum: number, pp: number, idx: number) => cum + Math.pow(WEIGHT_COEFFICIENT, idx + startIdx) * pp, 0);

const getTotalPp = (scores: any[]) =>
	scores && Array.isArray(scores) ? getTotalPpFromSortedPps(scores.map(s => s?.score?.pp).sort((a, b) => b - a)) : null;

const convertScoresToObject = (scores: any[], idFunc = (score: { leaderboard: { id: any; }; }) => score?.leaderboard?.id, asArray = false) =>
	scores.reduce((scoresObj: { [x: string]: any; }, score: any) => {
		const _id = idFunc(score);
		if (!_id) return scoresObj;

		if (asArray) {
			if (!scoresObj[_id]) scoresObj[_id] = [];

			scoresObj[_id].push({...score});
		} else {
			scoresObj[_id] = {...score};
		}

		return scoresObj;
	}, {});

export const getTotalPlayerPp = (scores: any, modifiedScores = {}) =>
	getTotalPp(
		Object.values({
			...convertScoresToObject(scores),
			...modifiedScores,
		})
	);

export function getWhatIfScore(scores: any, leaderboardId: any, pp = 0) {
	const currentTotalPp = getTotalPlayerPp(scores);
	if (!currentTotalPp) return null;

	const newTotalPp = getTotalPlayerPp(scores, {[leaderboardId]: {score: {pp}}});

	return {
		currentTotalPp,
		newTotalPp,
		diff: newTotalPp - currentTotalPp,
	};
}

export const calcPpBoundary = (rankedScores: any[], expectedPp = 1) => {
	if (!rankedScores || !Array.isArray(rankedScores)) return null;

	const calcRawPpAtIdx = (bottomScores: any[], idx: number, expected: number) => {
		const oldBottomPp = getTotalPpFromSortedPps(bottomScores, idx);
		const newBottomPp = getTotalPpFromSortedPps(bottomScores, idx + 1);

		// 0.965^idx * rawPpToFind = expected + oldBottomPp - newBottomPp;
		// rawPpToFind = (expected + oldBottomPp - newBottomPp) / 0.965^idx;
		return (expected + oldBottomPp - newBottomPp) / Math.pow(WEIGHT_COEFFICIENT, idx);
	};

	const rankedScorePps = rankedScores.map(s => s?.score?.pp ?? 0).sort((a, b) => b - a);

	let idx = rankedScorePps.length - 1;

	while (idx >= 0) {
		const bottomSlice = rankedScorePps.slice(idx);
		const bottomPp = getTotalPpFromSortedPps(bottomSlice, idx);

		bottomSlice.unshift(rankedScorePps[idx]);
		const modifiedBottomPp = getTotalPpFromSortedPps(bottomSlice, idx);
		const diff = modifiedBottomPp - bottomPp;

		if (diff > expectedPp) {
			return calcRawPpAtIdx(rankedScorePps.slice(idx + 1), idx + 1, expectedPp);
		}

		idx--;
	}

	return calcRawPpAtIdx(rankedScorePps, 0, expectedPp);
};
const app = express();
const port = 8081;
var cors = require('cors')
app.use(cors())

app.listen(port, () => console.log(`Server listening on port: ${port}`));
app.get('/AvC', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await getPPDifference('76561199073044136', '76561198024304712')).toString());
});
app.get('/CvA', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await getPPDifference('76561198024304712','76561199073044136')).toString());
});
app.get('/cerTop500', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await diffToTopX('76561198024304712',500)).toString());
});
app.get('/edgTop200', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await diffToTopX('76561198869979182',150)).toString());
});
app.get('/batTop1K', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await diffToTopX('76561198121538359',1000)).toString());
});
app.get('/bizzyNo2', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await diffToTopX('3225556157461414',2)).toString());
});
app.get('/sweedTop100', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await diffToTopX('76561199117055032',100)).toString());
});
app.get('/davinNo14', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await diffToTopX('76561199017330732',14)).toString());
});
app.get('/SgtvSte', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await diffToTopX('76561199122886452',750)).toString());
});
app.get('/jammyNo69', async (_req: any, res: { send: (arg0: string) => void; }) => {
    res.send((await diffToTopX('76561198180136111',69)).toString());
});

