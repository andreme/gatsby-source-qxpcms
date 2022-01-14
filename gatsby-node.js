const fetch = require('node-fetch');
const {createRemoteFileNode} = require(`gatsby-source-filesystem`);

exports.createSchemaCustomization = async ({actions, schema, store, cache, createNodeId, reporter}, {url, api_key}) => {
	const {createTypes, createNode} = actions;

	const response = await fetch(`${url}gatsby-schema`, {headers: {'x-qxpcms-api-key': api_key}});
	const body = await response.text();

	createTypes(body);

	const typeDefs = [
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
	const {createNode} = actions;

	const response = await fetch(`${url}raw-data`, {headers: {'x-qxpcms-api-key': api_key}});
	const body = await response.text();

	body.split('\n').map(JSON.parse).forEach(({name, data}) => {
		createNode({
			...data,
			internal: {
				type: name,
				contentDigest: createContentDigest(data),
			},
		});
	});
};
