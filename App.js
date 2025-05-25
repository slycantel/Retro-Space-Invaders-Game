import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTailwind } from 'tailwind-rn';
import { GameEngine } from 'react-native-game-engine';

const { width, height } = Dimensions.get('window');
const SHIP_SIZE = 40;
const ALIEN_SIZE = 30;
const BULLET_SIZE = 10;
const INITIAL_SHIP = { x: width / 2 - SHIP_SIZE / 2, y: height - 100, health: 3 };
const ALIEN_ROWS = 3;
const ALIEN_COLS = 5;

const App = () => {
  const tailwind = useTailwind();
  const [gameState, setGameState] = useState('menu');
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState([]);
  const [entities, setEntities] = useState({
    ship: { ...INITIAL_SHIP, renderer: <Ship /> },
    aliens: [],
    shipBullets: [],
    alienBullets: [],
  });

  // Load high scores
  useEffect(() => {
    const loadHighScores = async () => {
      try {
        const stored = await AsyncStorage.getItem('highScores');
        if (stored) setHighScores(JSON.parse(stored));
      } catch (error) {
        console.error('Error loading high scores:', error);
      }
    };
    loadHighScores();
  }, []);

  // Save high score
  const saveHighScore = async () => {
    try {
      const newScores = [...highScores, { score, date: new Date().toISOString() }]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      await AsyncStorage.setItem('highScores', JSON.stringify(newScores));
      setHighScores(newScores);
    } catch (error) {
      console.error('Error saving high score:', error);
    }
  };

  // Reset high scores
  const resetHighScores = async () => {
    try {
      await AsyncStorage.setItem('highScores', JSON.stringify([]));
      setHighScores([]);
      Alert.alert('Success', 'High scores cleared!');
    } catch (error) {
      console.error('Error resetting high scores:', error);
    }
  };

  // Initialize aliens
  const initAliens = () => {
    const aliens = [];
    for (let row = 0; row < ALIEN_ROWS; row++) {
      for (let col = 0; col < ALIEN_COLS; col++) {
        aliens.push({
          x: col * (ALIEN_SIZE + 20) + 50,
          y: row * (ALIEN_SIZE + 20) + 50,
          renderer: <Alien />,
        });
      }
    }
    return aliens;
  };

  // Game systems
  const systems = {
    moveShip: ({ entities, touches }) => {
      const ship = entities.ship;
      touches.forEach(touch => {
        ship.x = Math.max(0, Math.min(width - SHIP_SIZE, touch.event.pageX - SHIP_SIZE / 2));
      });
      return entities;
    },
    shootShipBullets: ({ entities, time }) => {
      if (time.current % 500 < 50) {
        entities.shipBullets.push({
          x: entities.ship.x + SHIP_SIZE / 2 - BULLET_SIZE / 2,
          y: entities.ship.y - BULLET_SIZE,
          renderer: <Bullet />,
        });
      }
      entities.shipBullets = entities.shipBullets.map(bullet => ({
        ...bullet,
        y: bullet.y - 5,
      })).filter(bullet => bullet.y > -BULLET_SIZE);
      return entities;
    },
    moveAliens: ({ entities, time }) => {
      const speed = 1 + score / 1000;
      entities.aliens = entities.aliens.map(alien => ({
        ...alien,
        x: alien.x + (Math.sin(time.current / 1000) * speed),
        y: alien.y + 0.02,
      }));
      if (!entities.aliens.length) {
        entities.aliens = initAliens();
        setScore(score + 100); // Bonus for clearing wave
      }
      return entities;
    },
    shootAlienBullets: ({ entities, time }) => {
      if (time.current % 1000 < 50 && entities.aliens.length) {
        const alien = entities.aliens[Math.floor(Math.random() * entities.aliens.length)];
        entities.alienBullets.push({
          x: alien.x + ALIEN_SIZE / 2 - BULLET_SIZE / 2,
          y: alien.y + ALIEN_SIZE,
          renderer: <Bullet color="red" />,
        });
      }
      entities.alienBullets = entities.alienBullets.map(bullet => ({
        ...bullet,
        y: bullet.y + 3,
      })).filter(bullet => bullet.y < height);
      return entities;
    },
    checkCollisions: ({ entities }) => {
      const ship = entities.ship;
      entities.aliens = entities.aliens.filter(alien => {
        const hit = entities.shipBullets.some(bullet => {
          if (
            Math.abs(bullet.x - alien.x) < ALIEN_SIZE &&
            Math.abs(bullet.y - alien.y) < ALIEN_SIZE
          ) {
            entities.shipBullets = entities.shipBullets.filter(b => b !== bullet);
            setScore(score + 10);
            return true;
          }
          return false;
        });
        if (
          Math.abs(ship.x - alien.x) < SHIP_SIZE &&
          Math.abs(ship.y - alien.y) < SHIP_SIZE
        ) {
          ship.health -= 1;
          if (ship.health <= 0) {
            setGameState('gameOver');
            saveHighScore();
          }
          return false;
        }
        return !hit;
      });
      entities.alienBullets.forEach(bullet => {
        if (
          Math.abs(bullet.x - ship.x) < SHIP_SIZE &&
          Math.abs(bullet.y - ship.y) < SHIP_SIZE
        ) {
          ship.health -= 1;
          entities.alienBullets = entities.alienBullets.filter(b => b !== bullet);
          if (ship.health <= 0) {
            setGameState('gameOver');
            saveHighScore();
          }
        }
      });
      return entities;
    },
  };

  // Start game
  const startGame = () => {
    setGameState('playing');
    setScore(0);
    setEntities({
      ship: { ...INITIAL_SHIP, renderer: <Ship /> },
      aliens: initAliens(),
      shipBullets: [],
      alienBullets: [],
    });
  };

  // Render components
  const Ship = () => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.ship.x, { duration: 50 }) },
        { translateY: withTiming(entities.ship.y, { duration: 50 }) },
      ],
    }));
    return <Reanimated.View style={[tailwind('w-10 h-10 bg-blue-500 rounded-lg'), style]} />;
  };

  const Alien = () => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.aliens[0]?.x || 0, { duration: 50 }) },
        { translateY: withTiming(entities.aliens[0]?.y || 0, { duration: 50 }) },
      ],
    }));
    return <Reanimated.View style={[tailwind('w-8 h-8 bg-green-500 rounded-full'), style]} />;
  };

  const Bullet = ({ color = 'yellow' }) => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.shipBullets[0]?.x || 0, { duration: 50 }) },
        { translateY: withTiming(entities.shipBullets[0]?.y || 0, { duration: 50 }) },
      ],
    }));
    return <Reanimated.View style={[tailwind(`w-3 h-3 bg-${color}-500 rounded-full`), style]} />;
  };

  // Render screens
  const renderMenu = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-4xl text-white mb-8')}>Retro Space Invaders</Text>
      <TouchableOpacity style={tailwind('bg-blue-500 p-4 rounded-lg mb-4')} onPress={startGame}>
        <Text style={tailwind('text-white text-lg')}>Start Game</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={tailwind('bg-gray-500 p-4 rounded-lg mb-4')}
        onPress={() => setGameState('highScores')}
      >
        <Text style={tailwind('text-white text-lg')}>High Scores</Text>
      </TouchableOpacity>
      <TouchableOpacity style={tailwind('bg-red-500 p-4 rounded-lg')} onPress={resetHighScores}>
        <Text style={tailwind('text-white text-lg')}>Reset Scores</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGame = () => (
    <View style={tailwind('flex-1 bg-gray-900')}>
      <GameEngine
        style={tailwind('flex-1')}
        systems={[
          systems.moveShip,
          systems.shootShipBullets,
          systems.moveAliens,
          systems.shootAlienBullets,
          systems.checkCollisions,
        ]}
        entities={entities}
        running={gameState === 'playing'}
      />
      <Text style={tailwind('text-white text-2xl absolute top-4 left-4')}>
        Score: {score} | Health: {entities.ship.health}
      </Text>
    </View>
  );

  const renderHighScores = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-3xl text-white mb-4')}>High Scores</Text>
      {highScores.length ? (
        highScores.map((entry, index) => (
          <Text key={index} style={tailwind('text-lg text-white')}>
            {index + 1}. {entry.score} points ({entry.date})
          </Text>
        ))
      ) : (
        <Text style={tailwind('text-lg text-white')}>No high scores yet.</Text>
      )}
      <TouchableOpacity
        style={tailwind('bg-blue-500 p-4 rounded-lg mt-4')}
        onPress={() => setGameState('menu')}
      >
        <Text style={tailwind('text-white text-lg')}>Back to Menu</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGameOver = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-3xl text-white mb-4')}>Game Over!</Text>
      <Text style={tailwind('text-2xl text-white mb-8')}>Score: {score}</Text>
      <TouchableOpacity style={tailwind('bg-blue-500 p-4 rounded-lg mb-4')} onPress={startGame}>
        <Text style={tailwind('text-white text-lg')}>Play Again</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={tailwind('bg-gray-500 p-4 rounded-lg')}
        onPress={() => setGameState('menu')}
      >
        <Text style={tailwind('text-white text-lg')}>Main Menu</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={tailwind('flex-1')}>
      {gameState === 'menu' && renderMenu()}
      {gameState === 'playing' && renderGame()}
      {gameState === 'highScores' && renderHighScores()}
      {gameState === 'gameOver' && renderGameOver()}
    </View>
  );
};

export default App;
