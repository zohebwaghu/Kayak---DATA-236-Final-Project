"""
Kafka Producer Wrapper using aiokafka
Native async Kafka producer as required by assignment
"""

import logging
import json
from typing import Optional, Dict, Any, List
from datetime import datetime

from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaError

from config import settings

logger = logging.getLogger(__name__)


class KafkaProducerWrapper:
    """
    Native async Kafka producer using aiokafka

    Provides async methods for sending messages to Kafka topics
    Message format aligned with middleware kafka.js
    """

    def __init__(
        self,
        bootstrap_servers: str = None,
        client_id: str = "ai-deals-agent",
        acks: str = "all",
        retries: int = 3
    ):
        """
        Initialize Kafka producer

        Args:
            bootstrap_servers: Kafka broker addresses
            client_id: Client identifier
            acks: Acknowledgment level (0, 1, all)
            retries: Number of retries on failure
        """
        self.bootstrap_servers = bootstrap_servers or settings.KAFKA_BOOTSTRAP_SERVERS
        self.client_id = client_id
        self.acks = acks
        self.retries = retries

        self._producer: Optional[AIOKafkaProducer] = None

    async def start(self):
        """Start the Kafka producer"""
        if self._producer:
            return

        try:
            self._producer = AIOKafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                client_id=self.client_id,
                acks=self.acks,
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                request_timeout_ms=30000,
                retry_backoff_ms=100,
                max_batch_size=16384,
                linger_ms=5
            )

            await self._producer.start()
            logger.info(f"Kafka producer started, connected to: {self.bootstrap_servers}")

        except KafkaError as e:
            logger.error(f"Failed to start Kafka producer: {e}")
            raise

    async def stop(self):
        """Stop the Kafka producer"""
        if self._producer:
            try:
                await self._producer.stop()
                logger.info("Kafka producer stopped")
            except Exception as e:
                logger.error(f"Error stopping Kafka producer: {e}")
            finally:
                self._producer = None

    async def send(
        self,
        topic: str,
        value: Dict,
        key: Optional[str] = None,
        headers: Optional[List[tuple]] = None
    ) -> bool:
        """
        Send a message to a Kafka topic

        Args:
            topic: Target topic name
            value: Message value (dict)
            key: Optional message key for partitioning
            headers: Optional message headers

        Returns:
            True if successful, False otherwise
        """
        if not self._producer:
            logger.error("Kafka producer not started")
            return False

        try:
            # Add timestamp if not present
            if isinstance(value, dict) and "timestamp" not in value:
                value["timestamp"] = datetime.now().isoformat()

            # Send message using native aiokafka async
            record_metadata = await self._producer.send_and_wait(
                topic,
                value=value,
                key=key,
                headers=headers
            )

            logger.debug(
                f"Sent message to {topic} "
                f"partition {record_metadata.partition} "
                f"offset {record_metadata.offset}"
            )

            return True

        except Exception as e:
            logger.error(f"Error sending message to {topic}: {e}")
            return False

    async def send_scored_deal(
        self,
        key: str,
        score: int,
        reason: str,
        attrs: Dict
    ) -> bool:
        """
        Send a scored deal to deals.scored topic

        Message format (aligned with middleware):
        {
            "key": "flight_123",
            "score": 78,
            "reason": "Good price for nonstop flight",
            "ts": "2025-11-08T10:31:00Z",
            "attrs": { ... }
        }
        """
        message = {
            "key": key,
            "score": score,
            "reason": reason,
            "ts": datetime.now().isoformat(),
            "attrs": attrs
        }

        return await self.send(
            topic=settings.KAFKA_DEALS_SCORED_TOPIC,
            value=message,
            key=key
        )

    async def send_tagged_deal(
        self,
        key: str,
        tags: List[str],
        attrs: Dict
    ) -> bool:
        """
        Send a tagged deal to deals.tagged topic

        Message format (aligned with middleware):
        {
            "key": "flight_123",
            "tags": ["excellent_deal", "nonstop"],
            "ts": "2025-11-08T10:31:00Z",
            "attrs": { ... }
        }
        """
        message = {
            "key": key,
            "tags": tags,
            "ts": datetime.now().isoformat(),
            "attrs": attrs
        }

        return await self.send(
            topic=settings.KAFKA_DEALS_TAGGED_TOPIC,
            value=message,
            key=key
        )

    async def send_deal_event(
        self,
        key: str,
        event_type: str,
        payload: Dict,
        score: Optional[int] = None,
        tags: Optional[List[str]] = None
    ) -> bool:
        """
        Send a deal event to deal.events topic

        Event types (aligned with MongoDB init.js):
        - deal_detected
        - deal_scored
        - deal_tagged
        - price_drop
        - inventory_low
        - watch_alert
        """
        message = {
            "key": key,
            "event_type": event_type,
            "ts": datetime.now().isoformat(),
            "payload": payload
        }

        if score is not None:
            message["score"] = score

        if tags:
            message["tags"] = tags

        return await self.send(
            topic=settings.KAFKA_DEAL_EVENTS_TOPIC,
            value=message,
            key=key
        )

    async def send_batch(
        self,
        topic: str,
        messages: List[Dict],
        key_field: str = "key"
    ) -> int:
        """
        Send a batch of messages to a topic

        Args:
            topic: Target topic
            messages: List of message dicts
            key_field: Field to use as message key

        Returns:
            Number of successfully sent messages
        """
        if not self._producer:
            logger.error("Kafka producer not started")
            return 0

        success_count = 0

        for message in messages:
            key = message.get(key_field) if key_field else None

            if await self.send(topic, message, key):
                success_count += 1

        # Flush to ensure all messages are sent
        await self.flush()

        logger.info(f"Sent batch of {success_count}/{len(messages)} messages to {topic}")

        return success_count

    async def flush(self, timeout: float = 10.0):
        """
        Flush all pending messages

        Args:
            timeout: Timeout in seconds (not used in aiokafka, kept for compatibility)
        """
        if self._producer:
            await self._producer.flush()

    @property
    def is_connected(self) -> bool:
        """Check if producer is connected"""
        return self._producer is not None
