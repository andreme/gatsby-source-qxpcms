const fetch = require('node-fetch');
const {createRemoteFileNode} = require(`gatsby-source-filesystem`);

exports.createSchemaCustomization = async ({actions, schema, store, cache, createNodeId, reporter}, {url, api_key}) => {
	const {createTypes, createNode} = actions;

	const response = await fetch(`${url}gatsby-schema`, {headers: {'x-qxpcms-api-key': api_key}});
	const body = await response.text();

	createTypes(body);

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

exports.sourceNodes = async ({
	actions,
	createContentDigest,
	createNodeId,
}, {url, api_key}) => {
	const {createNode} = actions; // touchNode for incremental sync
	// // Touch existing nodes so Gatsby doesn't garbage collect them.
	// Object.values(store.getState().nodes)
	// 	.filter(n => n.internal.type.slice(0, 8) === typePrefix)
	// 	.forEach(n => touchNode(n));

	const info = await (await fetch(`${url}raw-data/info`, {headers: {'x-qxpcms-api-key': api_key}})).json();

	for (const {name, values} of info.bags) {
		createNode({
			...values,
			internal: {
				type: name,
				contentDigest: createContentDigest(values),
			},
		});
	}

	for (const list of info.lists) {
		let next = undefined;
		do {
			const data = await (await fetch(`${url}raw-data/list/${list.id}`, {
				method: 'post',
				body: JSON.stringify({continuationMarker: next}),
				headers: {
					'x-qxpcms-api-key': api_key,
					'Content-Type': 'application/json',
				},
			})).json();

			for (const item of data.items) {
				createNode({
					...item,
					internal: {
						type: list.name,
						contentDigest: createContentDigest(item),
					},
				});
			}

			next = data.continuationMarker;
		} while (next);
	}
};
