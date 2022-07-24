const fetch = require('node-fetch');
const {createRemoteFileNode} = require(`gatsby-source-filesystem`);
const {ApolloClient, HttpLink, InMemoryCache, gql} = require('@apollo/client/core');

exports.createSchemaCustomization = async ({actions, schema, store, cache, createNodeId, reporter}, {url, api_key}) => {
	const {createTypes, createNode} = actions;

	const client = createCMSClient(url, api_key);

	const {data: {cms: {gatsbySchema}}} = await client.query({
		query: gql`
			query {
				cms {
					gatsbySchema
				}
			}
		`,
	});

	createTypes(gatsbySchema);

	const typeDefs = [
		schema.buildObjectType({
			name: 'CMSFile',
			fields: {
				name: {
					type: 'String',
				},
				URL: {
					type: 'String',
				},
				hash: {
					type: 'String',
				},
				localFile: {
					type: 'File',
					resolve(source) {
						if (source?.URL) {
							return createRemoteFileNode({
								url: source.URL,
								store,
								cache,
								createNode,
								createNodeId,
								reporter,
							});
						}
						return null;
					},
				},
			},
		}),
		schema.buildObjectType({
			name: 'CMSImage',
			fields: {
				name: {
					type: 'String',
				},
				URL: {
					type: 'String',
				},
				hash: {
					type: 'String',
				},
				localFile: {
					type: 'File',
					resolve(source) {
						if (source?.URL) {
							return createRemoteFileNode({
								url: source.URL,
								store,
								cache,
								createNode,
								createNodeId,
								reporter,
							});
						}
						return null;
					},
				},
			},
		}),
	];
	createTypes(typeDefs);
};

const lastSynced = {};
exports.sourceNodes = async ({
	actions,
	createContentDigest,
	createNodeId,
	cache,
	store,
	getNodesByType,
}, {url, api_key}) => {
	const {createNode, touchNode} = actions;

	const client = createCMSClient(url, api_key);

	const {data: {cms: {lists, bags}}} = await client.query({
		query: gql`
			query {
				cms {
					lists {
						name
						gqlSelect
						namePlural
						listType
						active
					}
					bags {
						id
						name
						active
						caption
						values
						created
						updated
					}
				}
			}
		`,
	});

	for (const {name, values, ...systemValues} of bags) {
		const bagValues = {...JSON.parse(values), ...systemValues};
		createNode({
			...bagValues,
			internal: {
				type: name,
				contentDigest: createContentDigest(bagValues),
			},
		});
	}

	const listsToQuery = lists.filter(list => list.listType !== 'Inline' && list.active);
	for (const list of listsToQuery) {
		let lastUpdated = (await cache.get(getCacheKey(list.name))) ?? '1970-01-01T00:00:01.000Z';

		getNodesByType(list.name).forEach(node => touchNode(node)); // Touch existing nodes so Gatsby doesn't garbage collect them.

		do {
			const {data: {lists: {items}}} = await client.query({
				query: gql`
					query ($lastUpdated: String!) {
						lists {
							items: ${list.namePlural}(lastUpdated: $lastUpdated) {
								${list.gqlSelect}
							}
						}
					}
				`,
				variables: {
					lastUpdated,
				},
			});

			for (const item of items) {
				const {__typename, ...cleanItem} = item;
				createNode({
					...cleanItem,
					internal: {
						type: list.name,
						contentDigest: createContentDigest(cleanItem),
					},
				});
			}

			const lastItem = items.length ? items[items.length - 1] : null;

			if (!lastItem || lastItem.updated === lastUpdated) {
				lastSynced[list.name] = (new Date((new Date(lastUpdated)).getTime() + 1)).toISOString();
				break;
			}

			lastUpdated = lastItem.updated;
		} while (lastUpdated);
	}
};

exports.onPostBuild = async ({cache}) => {
	for (const listName in lastSynced) {
		await cache.set(getCacheKey(listName), lastSynced[listName]);
	}
}

function getCacheKey(listName) {
	return `sync-timestamp-${listName}`;
}

function createCMSClient(url, api_key) {
	return new ApolloClient({
		defaultOptions: {
			query: {
				fetchPolicy: 'no-cache',
			},
		},
		link: new HttpLink({
			uri: `${url}graphql`,
			headers: {'x-qxpcms-api-key': api_key},
			fetch,
		}),
		cache: new InMemoryCache(),
	});
}
