(function (globalScope) {
  const GRID_SIZE = 12;
  const INITIAL_DIRECTION = "right";
  const DIRECTION_VECTORS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const OPPOSITE_DIRECTIONS = {
    up: "down",
    down: "up",
    left: "right",
    right: "left"
  };

  function createInitialGame(random = Math.random) {
    const snake = [
      { x: 4, y: 6 },
      { x: 3, y: 6 },
      { x: 2, y: 6 }
    ];

    return {
      gridSize: GRID_SIZE,
      snake,
      direction: INITIAL_DIRECTION,
      nextDirection: INITIAL_DIRECTION,
      food: createFoodPosition(snake, GRID_SIZE, random),
      score: 0,
      status: "ready"
    };
  }

  function restartGame(random = Math.random) {
    return createInitialGame(random);
  }

  function setDirection(game, requestedDirection) {
    if (!DIRECTION_VECTORS[requestedDirection]) {
      return game;
    }

    if (requestedDirection === game.direction || requestedDirection === OPPOSITE_DIRECTIONS[game.direction]) {
      return game;
    }

    return {
      ...game,
      nextDirection: requestedDirection
    };
  }

  function stepGame(game, random = Math.random) {
    if (game.status === "game-over" || game.status === "paused") {
      return game;
    }

    const direction = game.nextDirection;
    const movement = DIRECTION_VECTORS[direction];
    const head = game.snake[0];
    const nextHead = {
      x: head.x + movement.x,
      y: head.y + movement.y
    };
    const willEat = positionsEqual(nextHead, game.food);
    const bodyToCheck = willEat ? game.snake : game.snake.slice(0, -1);

    if (isOutOfBounds(nextHead, game.gridSize) || bodyToCheck.some((segment) => positionsEqual(segment, nextHead))) {
      return {
        ...game,
        direction,
        nextDirection: direction,
        status: "game-over"
      };
    }

    const snake = [nextHead, ...game.snake];
    if (!willEat) {
      snake.pop();
    }

    return {
      ...game,
      snake,
      direction,
      nextDirection: direction,
      food: willEat ? createFoodPosition(snake, game.gridSize, random) : game.food,
      score: willEat ? game.score + 1 : game.score,
      status: "running"
    };
  }

  function togglePause(game) {
    if (game.status === "game-over" || game.status === "ready") {
      return game;
    }

    return {
      ...game,
      status: game.status === "paused" ? "running" : "paused"
    };
  }

  function createFoodPosition(snake, gridSize, random = Math.random) {
    const openCells = [];

    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        if (!snake.some((segment) => segment.x === x && segment.y === y)) {
          openCells.push({ x, y });
        }
      }
    }

    if (!openCells.length) {
      return null;
    }

    const index = Math.floor(random() * openCells.length);
    return openCells[index];
  }

  function positionsEqual(a, b) {
    return Boolean(a && b) && a.x === b.x && a.y === b.y;
  }

  function isOutOfBounds(position, gridSize) {
    return position.x < 0 || position.y < 0 || position.x >= gridSize || position.y >= gridSize;
  }

  const api = {
    GRID_SIZE,
    createInitialGame,
    restartGame,
    setDirection,
    stepGame,
    togglePause,
    createFoodPosition
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.SnakeGame = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
