import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const maindir = __dirname;

const statsDir = path.join(maindir, 'stats');
const playersDir = path.join(maindir, 'players');
const totalsDir = path.join(maindir, 'totals');

const IGNORE_NAMES = [
	'Ar2vian',
	'ImJayzus',
	'Immortal_Puff',
	'JustinCam',
	'WhoIsJoe27',
	'Alex',
	'Steve',
];

type StatData = Record<string, number>;

interface PlayerStats {
	playerName: string;
	categories: Record<string, StatData>;
}

async function getUsernameFromUUID(uuid: string): Promise<string | null> {
	const url = `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`;

	try {
		const response = await fetch(url);

		if (!response.ok) {
			console.error(
				`Failed to fetch username for UUID: ${uuid}. Status: ${response.status}`,
			);
			return null;
		}

		const data = await response.json();
		if (data !== undefined && data !== null) {
			// Wait for 0.5 second between requests
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Get the most recent username
			return data.name;
		}

		return null;
	} catch (error) {
		console.error(`Error fetching username for UUID: ${uuid}`, error);
		return null;
	}
}

async function parseAndSaveFiles(): Promise<{
	categoryList: Record<string, Set<string>>;
	playerStatsList: PlayerStats[];
}> {
	const categoryList: Record<string, Set<string>> = {};
	const playerStatsList: PlayerStats[] = [];

	for (const filename of fs.readdirSync(statsDir)) {
		const filePath = path.join(statsDir, filename);
		const playerUUID = filename.split('.json')[0];
		const playerName = await getUsernameFromUUID(playerUUID);

		if (playerName === null || playerName === undefined) {
			return null;
		}

		if (IGNORE_NAMES.includes(playerName)) {
			console.log('ignoring ' + playerName);
			continue;
		}

		const playerStats: PlayerStats = { playerName, categories: {} };

		// Read file content
		const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

		// Create a directory for the player's data
		const playerPath = path.join(playersDir, playerName);
		if (!fs.existsSync(playerPath)) {
			fs.mkdirSync(playerPath);
		}

		// Process each statistic category
		for (const statCategory in data.stats) {
			const categoryName = statCategory.replace('minecraft:', '');
			if (categoryList[categoryName] === undefined) {
				categoryList[categoryName] = new Set();
			}
			const statData: StatData = {};

			for (const stat in data.stats[statCategory]) {
				const statName = stat.replace('minecraft:', '');
				categoryList[categoryName].add(statName);

				statData[statName] = parseInt(
					data.stats[statCategory][stat],
					10,
				);
			}

			// Add to playerStats
			playerStats.categories[categoryName] = statData;

			// Write sorted data to a CSV file
			const statCategoryFile = path.join(
				playerPath,
				`${categoryName}.csv`,
			);
			// Sort statData by value
			const sortedStatData = Object.entries(statData).sort(
				(a, b) => b[1] - a[1],
			);

			// Prepare CSV content
			let csvContent = 'Stat Name,Value\n';
			for (const [statName, value] of sortedStatData) {
				csvContent += `${statName},${value}\n`;
			}

			fs.writeFileSync(statCategoryFile, csvContent, 'utf-8');
		}

		// Add to playerStatsList
		playerStatsList.push(playerStats);
	}

	return { categoryList, playerStatsList };
}

async function saveTotals(
	categoryList: Record<string, Set<string>>,
	playerStatsList: PlayerStats[],
) {
	for (const [catName, statNames] of Object.entries(categoryList)) {
		// Start of category file
		const sortedStatNames = Array.from(statNames).sort();
		const sortedPlayerStatsList = playerStatsList.sort((a, b) =>
			a.playerName.localeCompare(b.playerName),
		);

		const allRows = [];
		const firstRow = [
			catName,
			...sortedPlayerStatsList.map((psl) => psl.playerName),
			'total',
			'avg',
			'min',
			'max',
		];

		allRows.push(firstRow);

		// Get rows for each player
		for (const statName of sortedStatNames) {
			const row = [statName];
			let total = 0;
			let avg = 0;
			let min = Infinity;
			let minPlayer = undefined;
			let max = -Infinity;
			let maxPlayer = undefined;

			// Collect values for each player
			for (const playerStats of sortedPlayerStatsList) {
				const playerName = playerStats.playerName;

				const statData: StatData = playerStats.categories?.[catName];
				const statValue = statData?.[statName] ?? 0;
				row.push(String(statValue));

				total += statValue;

				// Check for min values
				if (statValue === min) {
					minPlayer = 'tie';
				} else if (statValue < min) {
					min = statValue;
					minPlayer = playerName;
				}
				// Check for max values
				if (statValue === max) {
					maxPlayer = 'tie';
				} else if (statValue > max) {
					max = statValue;
					maxPlayer = playerName;
				}
			}

			// Calculate the average
			avg = total / playerStatsList.length;

			// Add the total, avg, min, and max to the row
			row.push(
				total.toString(),
				avg.toFixed(2),
				`${min} (${minPlayer})`,
				`${max} (${maxPlayer})`,
			);

			allRows.push(row);
		}

		// Add blank row
		allRows.push(new Array(firstRow.length).fill(','));

		const pTotalRow = ['pTotal'];
		const pAvgRow = ['pAvg'];
		const pMinRow = ['pMin'];
		const pMaxRow = ['pMax'];

		// Get playerMin, playerMax, playerAvg, and playerTotal for each value
		for (const playerStats of sortedPlayerStatsList) {
			const statValueList = playerStats.categories?.[catName];
			if (statValueList) {
				const values = Object.values(statValueList);
				const keys = Object.keys(statValueList);

				const minValue = Math.min(...values);
				const maxValue = Math.max(...values);
				const minKeys = keys.filter(
					(key) => statValueList[key] === minValue,
				);
				const maxKeys = keys.filter(
					(key) => statValueList[key] === maxValue,
				);

				const minKey = minKeys.length === 1 ? minKeys[0] : 'tie';
				const maxKey = maxKeys.length === 1 ? maxKeys[0] : 'tie';
				const total = values.reduce((sum, value) => sum + value, 0);
				const avg = total / values.length;

				pTotalRow.push(String(total));
				pAvgRow.push(String(avg.toFixed(2)));
				pMinRow.push(`${minValue} (${minKey})`);
				pMaxRow.push(`${maxValue} (${maxKey})`);
			} else {
				pTotalRow.push('N/A');
				pAvgRow.push('N/A');
				pMinRow.push('N/A');
				pMaxRow.push('N/A');
			}
		}

		// Add player totals to allRows
		allRows.push(pTotalRow);
		allRows.push(pAvgRow);
		allRows.push(pMinRow);
		allRows.push(pMaxRow);

		// Prepare CSV content
		const totalCatFile = path.join(totalsDir, `${catName}.csv`);
		const csvContent = allRows.map((row) => row.join(',')).join('\n');

		fs.writeFileSync(totalCatFile, csvContent, 'utf-8');
	}
}

function ensureDirectory(dirname: string) {
	if (!fs.existsSync(dirname)) {
		fs.mkdirSync(dirname);
	}
}

async function start() {
	console.log('ensuring directories...');

	ensureDirectory(statsDir);
	ensureDirectory(playersDir);
	ensureDirectory(totalsDir);

	console.log('getting player data...');

	const playerDataList = await parseAndSaveFiles();

	if (playerDataList === null || playerDataList === undefined) {
		console.log('error - probably failed to get player name from mojang!');
		return;
	}
	if (playerDataList.playerStatsList.length === 0) {
		console.log('error - no stats found! Please add to stat directory');
		return;
	}

	console.log('saving totals...');

	await saveTotals(
		playerDataList.categoryList,
		playerDataList.playerStatsList,
	);

	console.log('done!');
}

start();
