/**
 * Kafka Configuration and Utilities
 * Shared Kafka setup for all microservices
 */

const { Kafka, logLevel } = require('kafkajs');

/**
 * Create Kafka client instance
 * @param {string} clientId - Unique identifier for this client
 * @returns {Kafka} - Kafka client instance
 */
const createKafkaClient = (clientId) => {
  return new Kafka({
    clientId: clientId || process.env.KAFKA_CLIENT_ID || 'kayak-middleware',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    logLevel: logLevel.INFO,
    retry: {
      initialRetryTime: 100,
      retries: 8
    }
  });
};

/**
 * Create Kafka producer with error handling
 * @param {Kafka} kafka - Kafka client instance
 * @returns {Producer} - Kafka producer
 */
const createProducer = async (kafka) => {
  const producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionTimeout: 30000
  });

  await producer.connect();
  console.log('✅ Kafka producer connected');

  // Handle errors
  producer.on('producer.disconnect', () => {
    console.warn('⚠️  Kafka producer disconnected');
  });

  return producer;
};

/**
 * Create Kafka consumer with error handling
 * @param {Kafka} kafka - Kafka client instance
 * @param {string} groupId - Consumer group ID
 * @returns {Consumer} - Kafka consumer
 */
const createConsumer = async (kafka, groupId) => {
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000
  });

  await consumer.connect();
  console.log(`✅ Kafka consumer connected (group: ${groupId})`);

  // Handle errors
  consumer.on('consumer.disconnect', () => {
    console.warn('⚠️  Kafka consumer disconnected');
  });

  return consumer;
};

/**
 * Publish event to Kafka topic
 * @param {Producer} producer - Kafka producer
 * @param {string} topic - Topic name
 * @param {string} key - Message key (for partitioning)
 * @param {object} data - Event data
 */
const publishEvent = async (producer, topic, key, data) => {
  try {
    await producer.send({
      topic,
      messages: [{
        key,
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          ...data
        })
      }]
    });
    console.log(`📤 Published event to ${topic}: ${data.eventType}`);
  } catch (error) {
    console.error(`❌ Failed to publish event to ${topic}:`, error);
    throw error;
  }
};

/**
 * Subscribe to Kafka topics and process messages
 * @param {Consumer} consumer - Kafka consumer
 * @param {Array<string>} topics - Topics to subscribe to
 * @param {Function} messageHandler - Handler function for messages
 */
const subscribeToTopics = async (consumer, topics, messageHandler) => {
  try {
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
      console.log(`📥 Subscribed to topic: ${topic}`);
    }

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          console.log(`📨 Received event from ${topic}: ${event.eventType || 'unknown'}`);
          await messageHandler(topic, event, message);
        } catch (error) {
          console.error(`❌ Error processing message from ${topic}:`, error);
          // Don't throw - continue processing other messages
        }
      }
    });
  } catch (error) {
    console.error('❌ Error subscribing to topics:', error);
    throw error;
  }
};

/**
 * Gracefully disconnect Kafka clients
 */
const disconnectKafka = async (producer, consumer) => {
  try {
    if (producer) {
      await producer.disconnect();
      console.log('✅ Kafka producer disconnected');
    }
    if (consumer) {
      await consumer.disconnect();
      console.log('✅ Kafka consumer disconnected');
    }
  } catch (error) {
    console.error('❌ Error disconnecting Kafka:', error);
  }
};

// Kafka topic names (centralized)
const TOPICS = {
  // Command topics (producer -> consumer)
  USER_CREATE: 'user.create',
  BOOKING_REQUEST: 'booking.request',

  // Event topics (consumer -> downstream listeners)
  USER_EVENTS: 'user.events',
  LISTING_EVENTS: 'listing.events',
  BOOKING_EVENTS: 'booking.events',
  BILLING_EVENTS: 'billing.events',

  SEARCH_UPDATES: 'search.updates',
  ANALYTICS_EVENTS: 'analytics.events',

  // AI / deals
  DEALS_RAW: 'raw_supplier_feeds',
  DEALS_NORMALIZED: 'deals.normalized',
  DEALS_SCORED: 'deals.scored',
  DEALS_TAGGED: 'deals.tagged',
  DEAL_EVENTS: 'deal.events'
};

// Event types
const EVENT_TYPES = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_FAILED: 'user.failed',
  LISTING_CREATED: 'listing.created',
  LISTING_UPDATED: 'listing.updated',
  LISTING_DELETED: 'listing.deleted',
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_FAILED: 'booking.failed',
  PAYMENT_PROCESSED: 'payment.processed',
  PAYMENT_FAILED: 'payment.failed',
  INVOICE_GENERATED: 'invoice.generated'
};

module.exports = {
  createKafkaClient,
  createProducer,
  createConsumer,
  publishEvent,
  subscribeToTopics,
  disconnectKafka,
  TOPICS,
  EVENT_TYPES
};
