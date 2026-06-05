/**
 * Elasticsearch integration for full-text message search.
 * Falls back gracefully if ES is unavailable.
 */

import { Client } from "@elastic/elasticsearch";

const ES_URL = process.env.ELASTICSEARCH_URL || "http://127.0.0.1:9200";
const INDEX = "webchat-messages";

let esClient = null;
let esReady = false;

export function getElasticClient() {
  if (!esClient) {
    esClient = new Client({ node: ES_URL });
  }
  return esClient;
}

/**
 * Initialize Elasticsearch — create index with mappings if it doesn't exist.
 * Called on service startup. Non-fatal if ES is unavailable.
 */
export async function initElastic() {
  if (!process.env.ELASTICSEARCH_URL) {
    console.log("[elastic] ELASTICSEARCH_URL not set — search will use MongoDB regex fallback");
    return;
  }
  try {
    const client = getElasticClient();
    const exists = await client.indices.exists({ index: INDEX });
    if (!exists) {
      await client.indices.create({
        index: INDEX,
        body: {
          mappings: {
            properties: {
              room_id: { type: "keyword" },
              user_id: { type: "keyword" },
              username: { type: "keyword" },
              content: {
                type: "text",
                analyzer: "standard",
                fields: {
                  keyword: { type: "keyword", ignore_above: 256 }
                }
              },
              message_type: { type: "keyword" },
              timestamp: { type: "date" },
              deleted: { type: "boolean" }
            }
          }
        }
      });
      console.log(`[elastic] Index '${INDEX}' created`);
    }
    esReady = true;
    console.log(`[elastic] Connected to ${ES_URL}`);
  } catch (err) {
    console.warn(`[elastic] Not available (${err.message}) — falling back to MongoDB regex`);
  }
}

/**
 * Index a single message document into Elasticsearch.
 * Non-fatal on error.
 */
export async function indexMessage(doc) {
  if (!esReady) return;
  try {
    await getElasticClient().index({
      index: INDEX,
      id: doc._id?.toString(),
      document: {
        room_id: doc.room_id,
        user_id: doc.user_id,
        username: doc.username,
        content: doc.content,
        message_type: doc.message_type,
        timestamp: doc.timestamp || doc.createdAt || new Date(),
        deleted: doc.deleted || false
      }
    });
  } catch (err) {
    console.warn("[elastic] Index error:", err.message);
  }
}

/**
 * Full-text search messages in a room.
 * Returns array of { _id, room_id, user_id, username, content, timestamp }.
 * Falls back to null if ES unavailable (caller should use MongoDB regex).
 */
export async function searchMessages(roomId, query, limit = 50) {
  if (!esReady) return null;
  try {
    const result = await getElasticClient().search({
      index: INDEX,
      body: {
        size: limit,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ["content", "username"],
                  type: "best_fields",
                  fuzziness: "AUTO"
                }
              }
            ],
            filter: [
              { term: { room_id: roomId } },
              { term: { deleted: false } }
            ]
          }
        },
        sort: [{ timestamp: { order: "desc" } }]
      }
    });
    return result.hits.hits.map((h) => ({ _id: h._id, ...h._source }));
  } catch (err) {
    console.warn("[elastic] Search error:", err.message);
    return null;
  }
}

/**
 * Delete a message from the index (soft-delete sync).
 */
export async function deleteFromIndex(messageId) {
  if (!esReady) return;
  try {
    await getElasticClient().update({
      index: INDEX,
      id: messageId,
      doc: { deleted: true }
    });
  } catch (err) {
    console.warn("[elastic] Delete error:", err.message);
  }
}
